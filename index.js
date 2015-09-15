var events = require('events');
var qs = require('querystring');
var io = require('socket.io-client');
var xhr = require('xhr');
var thunky = require('thunky');
var urlJoin = require('url-join');
var isOk = require('is-ok');

module.exports = function(options) {
	options = options || {};

	var api = options.api || 'api.voiceboxer.com';
	var air = options.air || 'air.voiceboxer.com';

	var sockets = {};

	var onerror = function(err) {
		if(err) that.emit('error', err);
	};

	var filter = function(options) {
		return {
			access_token: options.access_token,
			refresh_token: options.refresh_token
		};
	};

	var request = function(method, path, headers, body, callback) {
		if(body) body = { data: body };

		xhr({
			method: method,
			url: urlJoin(api, path),
			headers: headers,
			json: body
		}, function(err, response, body) {
			if(err) return callback(err);
			if(!isOk(response, callback)) return;

			callback(null, body);
		});
	};

	var authenticate = thunky(function(callback) {
		if(options.access_token) return callback(null, filter(options));

		var body = {
			client_id: options.client_id,
			email: options.email,
			password: options.password
		};

		request('post', '/users/login', null, body, function(err, body) {
			if(err) return callback(err);
			callback(null, filter(body));
		});
	});

	var that = new events.EventEmitter();

	that.authenticate = authenticate;

	that.request = function(method, path, body, callback) {
		if(!callback && typeof body === 'function') {
			callback = body;
			body = undefined;
		}

		authenticate(function(err, token) {
			if(err) return callback(err);
			request(method, path, { Authorization: 'Bearer ' + token.access_token }, body, callback);
		});
	};

	that.register = function(literalId) {
		authenticate(function(err, token) {
			if(err) return onerror(err);

			var updated = 0;
			var socket = io(air, {
				reconnection: false,
				query: qs.stringify({
					literalId: literalId,
					token: token.access_token
				})
			});

			socket.on('connect', function() {
				that.emit('connect', literalId);
			});

			socket.on('error', onerror);

			socket.on('disconnect', function() {
				delete sockets[literalId];
				that.emit('disconnect', literalId);
			});

			[
				'register',
				'unregister',
				'status.start',
				'status.pause',
				'status.stop',
				'slide',
				'presenter',
				'presenter.available',
				'interpreter.available',
				'interpreter.switch.request',
				'interpreter.switch.approve',
				'interpreter.switch',
				'language'
			].forEach(function(name) {
				socket.on(name, function(message) {
					var ts = new Date(message.updatedAt);
					if(ts < updated) return;

					updated = ts;
					that.emit(name, message);
					that.emit('update', message);
				});
			});

			sockets[literalId] = socket;
		});
	};

	that.unregister = function(literalId) {
		var socket = sockets[literalId];
		if(socket) socket.disconnect();
	};

	['get', 'post', 'put', 'del', 'patch'].forEach(function(method) {
		that[method] = function(path, body, callback) {
			that.request(method, path, body, callback);
		};
	});

	return that;
};
