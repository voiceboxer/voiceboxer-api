var fs = require('fs');
var test = require('tape');

var voiceboxer = require('../').defaults({
	api: process.env.VOICEBOXER_API_URL,
	air: process.env.VOICEBOXER_AIR_URL,
	fil: process.env.VOICEBOXER_FIL_URL
});

var create = function() {
	return voiceboxer({
		client_id: process.env.VOICEBOXER_CLIENT_ID,
		email: process.env.VOICEBOXER_EMAIL,
		password: process.env.VOICEBOXER_PASSWORD
	});
};

var blobify = function(data, type) {
	try {
		return new Blob([data], { type: type });
	} catch(err) {
		var BlobBuilder = window.BlobBuilder || 
			window.WebKitBlobBuilder ||
			window.MozBlobBuilder;

		if(!BlobBuilder) throw err;

		var builder = new BlobBuilder();

		builder.append(data);
		return builder.getBlob(type);
	}
};

var png = fs.readFileSync(__dirname + '/vb.png');

test('authenticate', function(t) {
	var client = create();

	client.authenticate(function(err, body) {
		t.error(err);

		t.ok(body.access_token, 'has access token ' + body.access_token);
		t.ok(body.refresh_token, 'has refresh token ' + body.refresh_token);

		t.end();
	});
});

test('admin create presentation', function(t) {
	var client = create();
	var anon = voiceboxer();

	client.get('/users/me', function(err, user) {
		t.error(err);

		t.ok(user.id, 'has id ' + user.id);
		t.equals(user.email, process.env.VOICEBOXER_EMAIL);

		client.post('/presentations', {
			title: 'Test title',
			description: 'Test description',
			moderator: user.id
		}, function(err, presentation) {
			t.error(err);

			t.ok(presentation.literalId, 'has literal id ' + presentation.literalId);
			t.equals(presentation.moderator.id, user.id);
			t.equals(presentation.me.role, 'moderator');

			t.test('register', function(t) {
 				t.plan(7);

				client.on('register', function(data) {
					t.equals(data.literalId, presentation.literalId);
					t.equals('available', data.moderator.status);

					client.unregister(presentation.literalId);
				});

				client.on('update', function(data) {
					t.equals(data.literalId, presentation.literalId);
				});

				client.on('connect', function(literalId) {
					t.equals(literalId, presentation.literalId);
				});

				client.on('disconnect', function(literalId, reason) {
					t.equals(literalId, presentation.literalId);
					t.ok(reason, 'has reason ' + reason);
				});

				client.register(presentation.literalId, { status: 'available' }, function(err) {
					t.error(err);
				});
			});

			t.test('anon get presentation', function(t) {
				anon.get('/presentations/' + presentation.literalId, function(err, body) {
					t.error(err);

					t.equals(body.literalId, presentation.literalId);
					t.notOk(body.moderator);

					t.end();
				});
			});

			t.end();
		});
	});
});

test('api error', function(t) {
	var client = create();

	t.plan(2);

	client.on('api_error', function(err) {
		t.ok(err, err.message);
	});

	client.get('/does/not/exists', function(err) {
		t.ok(err, err.message);
	});
});

test('connect', function(t) {
	var client = create();

	client.connect(function(err, socket) {
		t.error(err);

		socket.on('drop', function(message) {
			t.ok(message.timestamp, 'has timestamp ' + message.timestamp);
			t.end();
		});

		socket.emit('drip');
	});
});

test('upload', function(t) {
	var client = create();
	var blob = blobify(png, 'image/png');

	client.upload(blob, { filename: 'vb.png' }, function(err, body) {
		t.error(err);

		t.equals(body.length, 1);
		t.equals(body[0].name, 'vb.png');
		t.ok(body[0].url, 'has url ' + body[0].url);

		t.end();
	});
});
