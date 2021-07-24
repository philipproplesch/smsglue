const os = require('os');
const fs = require('fs');
const path = require('path')
const log = require('npmlog');
const crypto = require('crypto');
const moment = require('moment');
const momenttz = require('moment-timezone');
const request = require('request');


SMSglue.date = function(d=undefined) {
  return moment.utc(d).format("YYYY-MM-DDTHH:mm:ss.SSZ");
}

// Parse request body, return object only if valid JSON and status == 'success'
SMSglue.parseBody = function(body) {
  try {
    body = JSON.parse(body);
    return (body.status == 'success') ? body : false;

  } catch(e) {
    return false;
  }
} 

// Send notification messages to all devices under this account
SMSglue.notify = function(id, cb) {

  // Read the cached push token and app id
  SMSglue.load('devices', id, (err, encrypted) => {

    // Decrypt and prep
    var sent = 0, hasError = false, validDevices = [];
    var devices = SMSglue.decrypt(encrypted) || [];

    // No devices to notify, hit the callback now
    if (!devices.length) cb();

    // This will be called after each request, but only do anything after the final request
    var updateCachedDevices = function() {
      // log.info('updateCachedDevices', `sent count: ${sent}`);
      
      // If number of messages sent matches the number of devices...
      if (sent >= devices.length) {
        // log.info('updateCachedDevices', 'sent matches device length');

        // If there was a push error, rewrite the devices file with on the valid devices
        if (hasError) {
          SMSglue.save('devices', id, SMSglue.encrypt(validDevices));
        }

        // All finished, hit the callback
        cb();
      }
    }

    // Send push notification to all devices on this account
    devices.forEach((device) => {

      request({
        method: 'POST',
        url: 'https://pnm.cloudsoftphone.com/pnm2',
        form: {
          verb: 'NotifyTextMessage',
          AppId: device.AppId,
          DeviceToken: device.DeviceToken
        }

      // On complete, add 1 to the sent counter, flag if there was an error (or add valid device if not) and call function above
      }, (error) => {
        sent++;
        if (error) hasError = true;
        else validDevices.push(device);
        updateCachedDevices();
      });
    });
  });
}


// INSTANCE METHODS

// Get SMS messages
SMSglue.prototype.get = function(cb) {

  // Query voip.ms for received SMS messages ranging from 90 days ago to tomorrow
  this.request({ 
    method: 'getSMS',
    from: moment.utc().subtract(90, 'days').format('YYYY-MM-DD'),
    to: moment.utc().add(1, 'day').format('YYYY-MM-DD'),
    limit: 9999,
    type: 1,
    timezone: (momenttz.tz('America/Edmonton').isDST()) ? -1 : 0

  // Wait for it... 
  }, (err, r, body) => {

    // Go on if there aren't any errors in the body
    if (body = SMSglue.parseBody(body)) {

      // Collect all SMS messages in an array of objects with the proper keys and formatting
      var smss = body.sms.map( (sms) => {
        return {
          sms_id: Number(sms.id),
          sending_date: SMSglue.date(sms.date),
          sender: sms.contact.replace(/\D/g,''),
          sms_text: sms.message
        }
      });

      // Save this as a encrypted json file and hit the callback when done
      SMSglue.save('messages', this.id, SMSglue.encrypt(smss, this.pass), cb);

    // Whoops, there was an error. Hit the callback with the error argument true
    } else {
      cb(true);
    }
  
  });
}
