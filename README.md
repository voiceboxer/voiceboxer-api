# voiceboxer-api-js-client

A light-weight javascript wrapper for the VoiceBoxer API.

	npm install voiceboxer-api-js-client

# Usage

Initiate the module using either and access token or user credentials.

```javascript
var voiceboxer = require('voiceboxer-api-js-client')({
	access_token: 'access_token'
});

voiceboxer.register('w4k4c1');

voiceboxer.on('update', function(liveEvent) {
	console.log(liveEvent);
});

voiceboxer.post('/live-events/w4k4c1/available', function(err, liveEvent) {
	console.log(liveEvent);
});
```
