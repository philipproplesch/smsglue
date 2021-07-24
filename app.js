app.get('/notify/:id', (req, res) => {
  log.info('Action', 'notify');
  
  // Deleted the cached history
  SMSglue.clear('messages', req.params.id, (err) => {

    // Send push notification to device(s) 
    SMSglue.notify(req.params.id, () => {
    
      // voip.ms expects this reply, otherwise it'll retry every 30 minutes
      res.setHeader('Content-Type', 'text/plain');
      res.send('ok');

    });
  });
});


app.get('/report/:id/:device/:app', (req, res) => {
  log.info('Action', 'report');

  // Read existing devices file
  SMSglue.load('devices', req.params.id, (err, encrypted) => {
    var devices = SMSglue.decrypt(encrypted) || [];

    // Add this push token & app id to the array
    if ((req.params.device) && (req.params.app)) {
      devices.push({
        DeviceToken: req.params.device,
        AppId: req.params.app
      });
    }

    // Remove any duplicates
    devices = devices.filter((device, index, self) => self.findIndex((d) => {return d.DeviceToken === device.DeviceToken }) === index)

    // Save changes to disk
    SMSglue.save('devices', req.params.id, SMSglue.encrypt(devices), (err) => {
      res.setHeader('Content-Type', 'application/json');
      res.send({ response: { error: 0, description: 'Success' }});
    });

  });
});


// Fetch cached SMS messages, filtered by last SMS ID
app.get(['/fetch/:token/:last_sms','/fetch/:token'], (req, res) => {
  log.info('Action', 'fetch');

  var glue = new SMSglue(req.params.token);
  var last_sms = Number(req.params.last_sms) || 0;

  // log.info('last_sms', last_sms);

  // Fetch filtered SMS messages back as JSON
  var fetchFilteredSMS = function(smss) {
    res.setHeader('Content-Type', 'application/json');
    res.send({
      date: SMSglue.date(),
      unread_smss: smss.filter((sms) => (Number(sms.sms_id) > last_sms))
    });
  }

  // First try to read the cached messages
  SMSglue.load('messages', glue.id, (err, data) => {

    // Decrypt the messages and send them back
    var smss = SMSglue.decrypt(data, glue.pass) || [];
    if (smss.length) {
      // log.info(glue.did, 'Found SMS cache')
      fetchFilteredSMS(smss);

    // If the array is empty, update the cache from voip.ms and try again
    } else {
      // log.info(glue.did, 'DID NOT find SMS cache')
      glue.get((error) => {

        // Read the cached messages one more time
        SMSglue.load('messages', glue.id, (err, data) => {

          // Decrypt the messages and send them back (last chance)
          smss = SMSglue.decrypt(data, glue.pass) || [];
          fetchFilteredSMS(smss);

        });
      });
    }
  });   
});

app.get('/send/:token/:dst/:msg', (req, res) => {
  log.info('Action', 'send');

  let glue = new SMSglue(req.params.token);
  glue.send(req.params.dst, req.params.msg, (err, r, body) => {

    body = SMSglue.parseBody(body);

    if ((body) && (!err)) {
      res.setHeader('Content-Type', 'application/json');
      res.send({ response: { error: 0, description: 'Success' }});

    } else {
      res.setHeader('Content-Type', 'application/json');
      res.send({ response: { error: 400, description: 'Invalid parameters' }});
    }
  });
});
