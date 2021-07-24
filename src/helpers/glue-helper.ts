import axios from "axios";
import { createCipher, createDecipher, CipherGCMTypes } from "crypto";
import * as fs from "fs";
import * as fsPromises from "fs/promises";
import * as path from "path";
import * as randomstring from "randomstring";

export class GlueHelper {

    private static _key: string;
    private static _algorithm: CipherGCMTypes = 'aes-192-gcm';

    private static _isInitialized = false;

    static buildTokenFromRequest(body: any): string {
        // Clone request body
        const clone: any = {};
        for (const attribute in body) {
            clone[attribute] = body[attribute];
        }

        delete clone.origin;

        return clone.did.substring(6) + '-' + this.encrypt(clone);
    }

    static encrypt(value: unknown, salt?: string): string {
        const key = salt ? this._key + salt : this._key;
        const cipher = createCipher(this._algorithm, key);

        let encrypted = cipher.update(JSON.stringify(value), 'utf-8', 'hex');
        encrypted += cipher.final('hex');

        return encrypted;
    }

    static decrypt(value: string, salt?: string): unknown {
        try {
            const key = salt ? this._key + salt : this._key;
            const decipher = createDecipher(this._algorithm, key);

            const decrypted = decipher.update(value, 'hex', 'utf-8');
            // decrypted += decipher.final('utf-8');

            return JSON.parse(decrypted);

        } catch (e) {
            return null;
        }
    }

    static async save(type: string, id: string, value: string): Promise<void> {
        const filename = path.resolve('cache', type, id);
        await fsPromises.writeFile(filename, value, 'utf8');
    }

    static async load(type: string, id: string): Promise<string | null> {
        const filename = path.resolve('cache', type, id);

        try {
            return await fsPromises.readFile(filename, 'utf8');
        } catch (e) {
            return null;
        }
    }

    static async clear(type: string, id: string): Promise<void> {
        const filename = path.resolve('cache', type, id);
        
        try {
            await fsPromises.unlink(filename);
        } catch (error) {
            return;
        }
    }

    static async notifyDevices(id: string): Promise<boolean> {
        await this.clear('messages', id);

        const encryptedDevices = await this.load('devices', id);

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const devices = this.decrypt(encryptedDevices!) as any[] || [];

        for (const device of devices) {
            try {
                await axios.post('https://pnm.cloudsoftphone.com/pnm2', {
                    verb: 'NotifyTextMessage',
                    AppId: device.AppId,
                    DeviceToken: device.DeviceToken
                });
            } catch (error) {
                // TODO: Error handling 
                return false;
            }
        }

        return true;
    }

    static async initialize(): Promise<void> {
        if (this._isInitialized) {
            return;
        }

        const cache = path.resolve(process.env.CACHE || 'cache');
        const key = path.resolve(process.env.CACHE || 'cache', 'key');
        const devices = path.resolve(process.env.CACHE || 'cache', 'devices');
        const messages = path.resolve(process.env.CACHE || 'cache', 'messages');
        const provisions = path.resolve(process.env.CACHE || 'cache', 'provisions');

        if (!fs.existsSync(cache)) {
            fs.mkdirSync(cache)
        }

        if (!fs.existsSync(key)) {
            fs.mkdirSync(key);
        }

        if (!fs.existsSync(devices)) {
            fs.mkdirSync(devices);
        }

        if (!fs.existsSync(messages)) {
            fs.mkdirSync(messages);
        }

        if (!fs.existsSync(provisions)) {
            fs.mkdirSync(provisions);
        }

        // Get crypto key (and generate if it doesn't exist yet)
        let encryptionKey = await this.load('key', 'key');
        if (encryptionKey == null) {
            encryptionKey = randomstring.generate();
            await this.save('key', 'key', encryptionKey);
        }

        this._key = key;
        this._isInitialized = true;
    }
}