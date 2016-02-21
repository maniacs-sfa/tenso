const path = require("path"),
	array = require("retsu"),
	coerce = require("tiny-coerce"),
	regex = require(path.join(__dirname, "regex.js")),
	iterate = require(path.join(__dirname, "iterate.js"));

const rateHeaders = [
	"x-ratelimit-limit",
	"x-ratelimit-remaining",
	"x-ratelimit-reset"
];

function decorate (req, res, next) {
	var obj = req.server.tenso;

	req.protect = false;
	req.protectAsync = false;
	req.unprotect = false;

	res.error = function (status, body) {
		return obj.error(req, res, status, body);
	};

	res.redirect = function (uri, perm = true) {
		return obj.redirect(req, res, uri, undefined, perm);
	};

	res.respond = function (body, status, headers) {
		return obj.respond(req, res, body, status, headers);
	};

	res.send = function (body, status, headers) {
		return obj.respond(req, res, body, status, headers);
	};

	next();
}

function asyncFlag (req, res, next) {
	req.protectAsync = true;
	next();
}

function bypass (req, res, next) {
	let pass = req.server.config.auth.unprotect.filter(function (i) {
			return i.test(req.url);
		}).length > 0;

	if (pass) {
		req.unprotect = true;
	}

	next();
}

function guard (req, res, next) {
	if (req.parsed.url === "/login" || req.isAuthenticated()) {
		next();
	} else {
		res.redirect("/login");
	}
}

function parse (req, res, next) {
	let args, type;

	if (regex.body.test(req.method) && req.body !== undefined) {
		type = req.headers["content-type"];

		if (regex.encode_form.test(type)) {
			args = req.body ? array.chunk(req.body.split(regex.body_split), 2) : [];
			req.body = {};

			array.each(args, function (i) {
				req.body[i[0]] = coerce(i[1]);
			});
		}

		if (regex.encode_json.test(type)) {
			try {
				req.body = JSON.parse(req.body);
			} catch (e) {
				console.warn(e.message);
			}
		}
	}

	next();
}

function keymaster (req, res, next) {
	let obj = req.server.tenso,
		authd = req.session && req.isAuthenticated(),
		method, result, routes, uri;

	// No authentication, or it's already happened
	if (!req.protect || !req.protectAsync || authd) {
		method = regex.get_rewrite.test(req.method) ? "get" : req.method.toLowerCase();
		routes = req.server.config.routes[method] || {};
		uri = req.parsed.pathname;

		if (uri in routes) {
			result = routes[uri];

			if (typeof result === "function") {
				result.call(obj, req, res);
			} else {
				res.send(result);
			}
		} else {
			iterate(routes, function (value, key) {
				if (new RegExp("^" + key + "$", "i").test(uri)) {
					return !(result = value);
				}
			});

			if (result) {
				if (typeof result === "function") {
					result.call(obj, req, res);
				} else {
					res.send(result);
				}
			} else {
				next(new Error(404));
			}
		}
	} else {
		next(new Error(401));
	}
}


function rate (req, res, next) {
	let config, good, results, server;

	if (req.unprotect) {
		next();
	} else {
		server = req.server;
		config = server.config.rate;
		results = server.tenso.rate(req, config.override);
		good = results.shift();

		rateHeaders.forEach(function (i, idx) {
			res.setHeader(i, results[idx]);
		});

		if (good) {
			next();
		} else {
			next(new Error(config.status || 429));
		}
	}
}

function zuul (req, res, next) {
	let uri = req.parsed.path,
		protectd = false;

	array.each(req.server.config.auth.protect, function (r) {
		if (r.test(uri)) {
			return !(protectd = true);
		}
	});

	// Setting state so the connection can be terminated properly
	req.protect = protectd;
	req.protectAsync = false;

	rate(req, res, function (e) {
		if (e) {
			next(e);
		} else if (protectd) {
			next();
		} else {
			keymaster(req, res, next);
		}
	});
}

function valid (req, res, next) {
	if (req.allow.indexOf(req.method) > -1) {
		next();
	} else {
		next(new Error(405));
	}
}

module.exports = {
	asyncFlag: asyncFlag,
	bypass: bypass,
	decorate: decorate,
	guard: guard,
	parse: parse,
	rate: rate,
	valid: valid,
	zuul: zuul
};