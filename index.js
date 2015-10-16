var events = require('events');
var qs = require('querystring');
var io = require('socket.io-client');
var xhr = require('xhr');
var thunky = require('thunky');
var urlJoin = require('url-join');
var appendQuery = require('append-query');
var isOk = require('is-ok');
var extend = require('xtend');

var xdr = xhr.XDomainRequest === window.XDomainRequest;

var noop = function() {};
var bearer = function(access_token) {
	return 'Bearer ' + access_token;
};

var create = function(options) {
	options = options || {};

	var api = options.api || 'api.voiceboxer.com';
	var air = options.air || 'air.voiceboxer.com';
	var fil = options.fil || 'fil.voiceboxer.com';

	var sockets = {};

	var filter = function(options) {
		return {
			access_token: options.access_token,
			refresh_token: options.refresh_token
		};
	};

	var request = function(method, path, access_token, body, callback) {
		if(!method) method = 'GET';
		else method = method.toUpperCase();

		if(body) body = { data: body };
		else body = {};

		var headers = null;

		if(xdr) {
			var query = {
				_headers: {
					Accept: 'application/json',
					'Content-Type': 'application/json'
				}
			};

			if(access_token) {
				query._headers.Authorization = bearer(access_token);
			}
			if(method !== 'GET') {
				query._method = method;
				method = 'POST';
			}

			query._headers = JSON.stringify(query._headers);
			path = appendQuery(path, query);
		} else if(access_token) {
			headers = { Authorization: bearer(access_token) };
		}

		xhr({
			useXDR: true,
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
		if(!options.client_id || !options.email || !options.password) return callback(null, null);

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

		callback = callback || noop;

		var onresponse = function(err) {
			if(err) that.emit('api_error', err);
			callback.apply(null, arguments);
		};

		authenticate(function(err, token) {
			if(err) return onresponse(err);
			request(method, path, token && token.access_token, body, onresponse);
		});
	};

	that.register = function(literalId, options, callback) {
		if(!callback && typeof options === 'function') {
			callback = options;
			options = null;
		}

		options = options || {};
		callback = callback || noop;

		var onerror = function(err) {
			that.emit('socket_error', err);
		};

		authenticate(function(err, token) {
			if(err) {
				callback(err);
				return onerror(err);
			}
			if(!token) {
				err = new Error('Token missing');
				callback(err);
				return onerror(err);
			}

			var updated = 0;
			var socket = io(air, {
				reconnection: false,
				multiplex: false,
				query: qs.stringify({
					literalId: literalId,
					token: token.access_token,
					status: options.status,
					language: options.language
				})
			});

			var onfinish = function(err) {
				socket.removeListener('connect', onfinish);
				socket.removeListener('connect_error', onfinish);
				socket.removeListener('error', onfinish);

				callback(err);
			};

			socket.on('connect', onfinish);
			socket.on('connect_error', onfinish);
			socket.on('error', onfinish);

			socket.on('connect', function() {
				that.emit('connect', literalId);
			});

			socket.on('connect_error', onerror);
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
				'presenter.slowdown',
				'interpreter.available',
				'interpreter.switch.request',
				'interpreter.switch.approve',
				'interpreter.switch',
				'language'
			].forEach(function(name) {
				socket.on(name, function(message) {
					that.emit(name, message);

					var ts = new Date(message.updatedAt);
					if(ts < updated) return;
					updated = ts;

					that.emit('update', message);
				});
			});

			socket.on('chat', function(message) {
				that.emit('chat', message);
			});

			socket.on('chat.booth', function(message) {
				that.emit('chat.booth', message);
			});

			sockets[literalId] = socket;
		});
	};

	that.unregister = function(literalId) {
		var socket = sockets[literalId];
		if(socket) socket.disconnect();
	};

	that.upload = function(body, options, callback) {
		if(!callback && typeof options === 'function') {
			callback = options;
			options = null;
		}

		options = options || {};
		callback = callback || noop;

		var onresponse = function(err) {
			if(err) that.emit('upload_error', err);
			callback.apply(null, arguments);
		};

		var url = urlJoin(fil, '/upload');
		if(options.filename) url = appendQuery(url, { filename: options.filename });

		xhr({
			method: 'POST',
			url: url,
			body: body
		}, function(err, response, body) {
			if(err) return onresponse(err);
			if(!isOk(response, onresponse)) return;

			body = JSON.parse(body);
			onresponse(null, body);
		});
	};

	['get', 'post', 'put', 'del', 'patch'].forEach(function(method) {
		that[method] = function(path, body, callback) {
			that.request(method, path, body, callback);
		};
	});

	return that;
};

module.exports = create;
module.exports.defaults = function(defaults) {
	return function(options) {
		options = extend(defaults || {}, options);
		return create(options);
	};
};
