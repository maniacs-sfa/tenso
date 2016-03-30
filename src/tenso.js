const path = require("path"),
	http = require("http"),
	array = require("retsu"),
	turtleio = require("turtle.io"),
	deferred = require("tiny-defer"),
	merge = require("tiny-merge"),
	regex = require(path.join(__dirname, "regex")),
	utility = require(path.join(__dirname, "utility"));

let renderers = require(path.join(__dirname, "renderers")),
	serializers = require(path.join(__dirname, "serializers"));

class Tenso {
	constructor (config = {headers: {}}) {
		config.headers.server = "tenso/{{VERSION}}";
		this.coap = null;
		this.hostname = "";
		this.rates = {};
		this.server = turtleio(config, (req, res, status, arg) => {
			this.error(req, res, status, arg);
		});
		this.server.tenso = this;
		this.websocket = null;
		this.version = "{{VERSION}}";
	}

	error (req, res, status = 500, arg) {
		let msg = arg || http.STATUS_CODES[status];

		return this.respond(req, res, msg instanceof Error ? msg : new Error(msg), status);
	}

	rate (req, fn) {
		let config = this.server.config.rate,
			id = req.sessionID || req.ip,
			valid = true,
			seconds = parseInt(new Date().getTime() / 1000, 10),
			limit, remaining, reset, state;

		if (!this.rates[id]) {
			this.rates[id] = {
				limit: config.limit,
				remaining: config.limit,
				reset: seconds + config.reset,
				time_reset: config.reset
			};
		}

		if (typeof fn === "function") {
			this.rates[id] = fn(req, this.rates[id]);
		}

		state = this.rates[id];
		limit = state.limit;
		remaining = state.remaining;
		reset = state.reset;

		if (seconds >= reset) {
			reset = state.reset = seconds + config.reset;
			remaining = state.remaining = limit - 1;
		} else if (remaining > 0) {
			state.remaining--;
			remaining = state.remaining;
		} else {
			valid = false;
		}

		return [valid, limit, remaining, reset];
	}

	redirect (req, res, uri, perm = false) {
		return this.server.send(req, res, "", !perm ? 302 : 301, {location: uri});
	}

	render (req, arg, headers) {
		let format = "application/json",
			accepts = utility.explode(req.parsed.query.format || req.headers.accept || format, ","),
			renderer;

		array.each(accepts, function (i) {
			let mimetype = i.replace(regex.mimetype, ""),
				found = false;

			if (renderers.has(mimetype)) {
				found = true;
				format = mimetype;
			}

			if (found) {
				return false;
			}
		});

		renderer = renderers.get(format);
		headers["content-type"] = format;

		return renderer(arg, req, headers, format === "text/html" ? this.server.config.template : undefined);
	}

	renderer (mimetype, fn) {
		renderers.set(mimetype, fn);

		return this;
	}

	respond (req, res, arg, status, headers) {
		let resStatus = status || 200,
			defer = deferred(),
			ref, output;

		if (!res._header) {
			ref = [headers || {}];

			if (res._headers) {
				merge(ref[0], res._headers);
			}

			// Decorating early for renderers
			if (ref[0].allow === undefined) {
				ref[0].allow = req.allow;
			}

			if (req.protect) {
				if (ref[0]["cache-control"] === undefined && this.server.config.headers["cache-control"]) {
					ref[0]["cache-control"] = utility.clone(this.server.config.headers["cache-control"]);
				}

				if (ref[0]["cache-control"] !== undefined && ref[0]["cache-control"].indexOf("private ") === -1) {
					ref[0]["cache-control"] = "private " + ref[0]["cache-control"];
				}
			}

			if (!regex.modify.test(req.method) && regex.modify.test(req.allow) && this.server.config.security.csrf && res.locals[this.server.config.security.key]) {
				ref[0][this.server.config.security.key] = res.locals[this.server.config.security.key];
			}

			output = this.render(req, utility.hypermedia(this.server, req, this.serialize(req, arg, resStatus), ref[0]), ref[0]);
			ref[0] = this.server.headers(req, res, resStatus, output, ref[0], false);
			this.server.send(req, res, output, resStatus, ref[0]).then(defer.resolve, defer.reject);
		} else {
			defer.resolve();
		}

		return defer.promise;
	}

	serialize (req, arg, status = 200, iot = false) {
		let format = "application/json",
			accepts = !iot ? utility.explode(req.parsed.query.format || req.headers.accept || format, ",") : format,
			errz = arg instanceof Error,
			result, serializer;

		array.each(accepts, function (i) {
			let mimetype = i.replace(regex.mimetype, ""),
				found = false;

			if (serializers.has(mimetype)) {
				found = true;
				format = mimetype;
			}

			if (found) {
				return false;
			}
		});

		serializer = serializers.get(format);

		if (errz) {
			result = serializer(null, arg, status < 400 ? 500 : status);
		} else {
			result = serializer(arg, null, status);
		}

		return result;
	}

	serializer (mimetype, fn) {
		serializers.set(mimetype, fn);

		return this;
	}
}

module.exports = function (config) {
	return new Tenso(config);
};
