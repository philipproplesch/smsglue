import axios from "axios";
import qs from "qs";
import { GlueProvider } from "./glue-provider";

export class SignalwireProvider extends GlueProvider {

    public async enableMessaging(): Promise<boolean> {

        try {
            const phoneNumbers = await axios.get(
                `https://${this.scope}.signalwire.com/api/relay/rest/phone_numbers`,
                {
                    auth: {
                        username: this.user,
                        password: this.pass
                    }
                });

            let phoneNumberId: string | null = null;
            for (const phoneNumber of phoneNumbers.data.data) {
                if (phoneNumber.number.indexOf(this.did) > 0) {
                    phoneNumberId = phoneNumber.id;
                    break;
                }
            }

            if (phoneNumberId) {
                await axios.put(
                    `https://${this.scope}.signalwire.com/api/relay/rest/phone_numbers/${phoneNumberId}`,
                    {
                        "message_handler": "laml_webhooks",
                        "message_request_url": this.hooks.notify,
                        "message_request_method": "POST",
                    },
                    {
                        auth: {
                            username: this.user,
                            password: this.pass
                        }
                    });
            }

        } catch (error) {
            return false;
        }

        return true;
    }

    protected async sendMessage(destination: string, body: string): Promise<OutboundMessage | null> {

        try {
            const data = qs.stringify({
                From: this.did,
                To: `+1${destination}`, // TODO: Format number
                Body: body,
            });

            const response = await axios.post(
                `https://${this.scope}.signalwire.com/api/laml/2010-04-01/Accounts/${this.user}/Messages.json`,
                data, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                auth: {
                    username: this.user,
                    password: this.pass
                }
            });

            return { sms_id: response.data.sid } as OutboundMessage;

        } catch (e) {
            return null;
        }
    }

    protected fetchMessages(): Promise<void> {
        throw new Error("Method not implemented.");
    }
}