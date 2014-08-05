/**
 * Tenso
 *
 * @constructor
 */
function Tenso () {
	this.hostname = "";
	this.messages = {};
	this.rates    = {};
	this.server   = new TurtleIO();
	this.version  = "{{VERSION}}";
}

/**
 * Setting constructor loop
 *
 * @method constructor
 * @memberOf Tenso
 * @type {Function}
 */
Tenso.prototype.constructor = Tenso;

/**
 * Sends an Error to the Client
 *
 * @method redirect
 * @memberOf Tenso
 * @param  {Object} req Client request
 * @param  {Object} res Client response
 * @param  {Mixed}  uri Target URI
 */
Tenso.prototype.error = function ( req, res, status, arg ) {
	this.server.error( req, res, status, arg );
};

/**
 * Returns rate limit information for Client request
 *
 * @method rate
 * @memberOf Tenso
 * @param {Object} req Client request
 * @param {Object} now Date of request
 * @returns {Array}    Array of rate limit information `[total, remaining, reset]`
 */
Tenso.prototype.rate = function ( req, now ) {
	var now       = new Date(),
	    limit     = 0,
		remaining = 0,
		reset     = 0;

	if ( reset === 0 ) {
		reset = parseInt( now.setHours( now.getHours() + 1 ) / 1000, 10 )
	}

	return [limit, remaining, reset];
};

/**
 * Redirects the Client
 *
 * @method redirect
 * @memberOf Tenso
 * @param  {Object} req Client request
 * @param  {Object} res Client response
 * @param  {Mixed}  uri Target URI
 */
Tenso.prototype.redirect = function ( req, res, uri ) {
	this.server.respond( req, res, this.server.messages.NO_CONTENT, this.server.codes.FOUND, {location: uri} );
};

/**
 * Sends a response to the Client
 *
 * @method respond
 * @memberOf Tenso
 * @param  {Object} req     Client request
 * @param  {Object} res     Client response
 * @param  {Mixed}  arg     Response body
 * @param  {Number} status  Response status
 * @param  {Object} headers Response headers
 * @return {Undefined}      undefined
 */
Tenso.prototype.respond = function ( req, res, arg, status, headers ) {
	var ref = [headers || {}];

	if ( !res._header ) {
		this.server.respond( req, res, hypermedia( this.server, req, response( arg, status ), ref[0] ), status, ref[0] );
	}
};
