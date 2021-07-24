import express, { json, urlencoded } from "express";
import * as fs from "fs";
import * as path from "path";
import { GlueHelper } from "./helpers/glue-helper";
import { SignalwireProvider } from "./providers/signalwire-provider";

const PORT = process.env.PORT || 5000;

const TIMER: { [name: string]: NodeJS.Timeout } = {};
const EMPTY_ACCOUNT = '<account></account>';

GlueHelper.initialize().then(() => {
    const app = express();

    app.use(urlencoded({ extended: false }));
    app.use(json());

    app.post('/enable', async (req, res) => {
        const token = await GlueHelper.buildTokenFromRequest(req.body);
        const provider = new SignalwireProvider(token, req.body.origin || '');

        if (await provider.enableMessaging()) {

            await GlueHelper.save('provisions', provider.id, GlueHelper.encrypt(provider.getAccountXml()));

            // Auto-empty this xml file (only "<account></account>") after 10 minutes of waiting...
            if (TIMER[provider.id]) {
                clearTimeout(TIMER[provider.id]);
            }

            TIMER[provider.id] = setTimeout(async () => {
                await GlueHelper.save('provisions', provider.id, GlueHelper.encrypt(EMPTY_ACCOUNT));
                // log.info('Provision', 'Cleared after 10 minute timeout');
            }, 600000);

            res.setHeader('Content-Type', 'application/json');
            res.send({ response: { error: 0, description: 'Success', hooks: provider.hooks } });

        } else {
            res.setHeader('Content-Type', 'application/json');
            res.send({ response: { error: 400, description: 'Invalid parameters' } });
        }
    });

    app.get('/provision/:id', async (req, res) => {
        let xml = EMPTY_ACCOUNT;

        const encrypted = await GlueHelper.load('provisions', req.params.id);
        if (encrypted !== null) {
            xml = GlueHelper.decrypt(encrypted) as string;

            if (TIMER[req.params.id]) {
                clearTimeout(TIMER[req.params.id]);
            }

            await GlueHelper.save('provisions', req.params.id, GlueHelper.encrypt(EMPTY_ACCOUNT));
        }

        res.setHeader('Content-Type', 'text/xml');
        res.send(xml);
    });

    app.post('/notify/:id', async (req, res) => {
        await GlueHelper.notifyDevices(req.params.id);

        res.sendStatus(200);
    });

    app.get('/report/:id/:device/:app', async (req, res) => {
        const encryptedDevices = await GlueHelper.load('devices', req.params.id);

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        let devices = GlueHelper.decrypt(encryptedDevices!) as any[] || [];

        // Add this push token & app id to the array
        if ((req.params.device) && (req.params.app)) {
            devices.push({
                DeviceToken: req.params.device,
                AppId: req.params.app
            });
        }

        // Remove any duplicates
        devices = devices.filter((device, index, self) => self.findIndex((d) => { return d.DeviceToken === device.DeviceToken }) === index)

        await GlueHelper.save('devices', req.params.id, GlueHelper.encrypt(devices));

        res.setHeader('Content-Type', 'application/json');
        res.send({ response: { error: 0, description: 'Success' } });
    });

    // Fetch cached SMS messages, filtered by last SMS ID
    app.post('/fetch/:token', (req, res) => {
        // TODO

        res.setHeader('Content-Type', 'application/json');
        res.send({ response: { error: 400, description: 'Invalid parameters' } });
    });

    app.post('/send/:token', async (req, res) => {
        const provider = new SignalwireProvider(req.params.token);
        const message = await provider.validateAndSendMessage(req.body.to, req.body.body);

        if (message) {
            res.setHeader('Content-Type', 'application/json');
            res.send(message);

        } else {
            res.setHeader('Content-Type', 'application/json');
            res.send({ response: { error: 400, description: 'Invalid parameters' } });
        }
    });

    app.get('/', (req, res) => {
        fs.readFile(path.resolve(__dirname, 'index.html'), 'utf8', (_, data) => {
            data = (process.env.BEFORE_CLOSING_BODY_TAG) ? data.replace("</body>", `${process.env.BEFORE_CLOSING_BODY_TAG}\n</body>`) : data;
            res.setHeader('Content-Type', 'text/html');
            res.send(data);
        });
    });

    app.get('*', (req, res) => {
        res.redirect('/');
    });

    app.listen(PORT, () => console.log(`server started at http://localhost:${PORT}`));
});