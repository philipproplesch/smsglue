/* eslint-disable @typescript-eslint/no-explicit-any */

import { GlueHelper } from "../helpers/glue-helper";

export abstract class GlueProvider {

    public user: string;
    public pass: string;
    public did: string;
    public scope: string;

    public id: string;
    public hooks: any;

    constructor(private token: string, private origin?: string) {

        // Decode and parse token JSON to object
        const decryptedToken: any = GlueHelper.decrypt(this.token.split('-')[1]);

        // Save token values
        this.user = decryptedToken.user.trim();
        this.pass = decryptedToken.pass.trim();
        this.did = decryptedToken.did.replace(/\D/g, '');
        this.scope = decryptedToken.scope.trim();

        // Determine identifer from DID
        this.id = this.did.substring(6) + '-' + GlueHelper.encrypt(this.did);

        // Setup hooks
        if (origin !== undefined) {
            this.hooks = {
                // This URL must be manually entered into Acrobits Softphone/Groundwire to enabled the next URLs
                provision: `${this.origin}/provision/${this.id}`,

                // Acrobits calls this URL to send us the push token and app id (needed for notifications)
                report: `${this.origin}/report/${this.id}/%pushToken%/%pushappid%`,

                // This URL is added to voip.ms to be called whenever a new SMS is received (it deletes the local cache of SMSs)
                notify: `${this.origin}/notify/${this.id}`,

                // Acrobits refresh the list of SMSs with this URL whenever the app is opened or a notification is received
                fetch: `${this.origin}/fetch/${this.token}`,

                // Acrobits submits to this URL to send SMS messages
                send: `${this.origin}/send/${this.token}`
            };
        }
    }

    public getAccountXml(): string {
        let xml = '<account>';

        // TODO: if (this.valid) {
        if (this.hooks.report) {
            xml += `<pushTokenReporterUrl>${this.hooks.report}</pushTokenReporterUrl>`;
        }

        if (this.hooks.fetch) {
            xml += `<genericSmsFetchUrl>${this.hooks.fetch}</genericSmsFetchUrl>`;
            xml += `<genericSmsFetchPostData>{ "last_id": "%last_known_sms_id%", "last_sent_id": "%last_known_sent_sms_id%", "device": "%installid%" }</genericSmsFetchPostData>`;
            xml += '<genericSmsFetchContentType>application/json</genericSmsFetchContentType>';
        }

        if (this.hooks.send) {
            xml += `<genericSmsSendUrl>${this.hooks.send}</genericSmsSendUrl>`;
            xml += `<genericSmsSendPostData>{ "to": "%sms_to%", "body": "%sms_body%" }</genericSmsSendPostData>`;
            xml += '<genericSmsContentType>application/json</genericSmsContentType>';
        }
        xml += '<allowMessage>1</allowMessage>';
        xml += '<voiceMailNumber>*97</voiceMailNumber>';
        // }

        xml += '</account>';
        return xml;
    }

    public async validateAndSendMessage(destination: string, body: string): Promise<OutboundMessage | null> {
        destination = destination.replace(/\D/g, '');
        body = body.trim();

        // TODO: Handle other international numbers

        // Remove leading '1' on 11-digit phone numbers
        if ((destination.length == 11) && (destination.charAt(0) == '1')) {
            destination = destination.slice(1);
        }

        // Validate destination number and message text
        if ((destination.length != 10) || (destination.length < 1)) {
            return null;
        }

        const chunks = body.match(/.{1,160}/g);

        let sms = null;

        if (chunks != null) {
            for (const chunk of chunks) {
                sms = await this.sendMessage(destination, chunk);
                if (!sms) {
                    return null;
                }
            }
        }

        return sms;
    }

    public abstract enableMessaging(): Promise<boolean>;

    protected abstract sendMessage(destination: string, body: string): Promise<OutboundMessage | null>;
    protected abstract fetchMessages(): Promise<void>;
}