var _ = require('lodash')
var Redis = require('ioredis')
var jwt = require('jsonwebtoken')

var PREFIX = {
  NAMESPACE: 'n:',
  USER: 'u:',
  TOKEN: 't:'
}

var DEFAULT = {
  NAMESPACE: 'ts',
  TTL: 7200,
  CLEANUP_INTERVAL: 300000 // 5 minutes
}

/**
* @class TokenSession
* @param {Object} opts {
*  [namespace]: String,
*  jwtSecret: String
* }
*/
function TokenSession (opts) {
  var _this = this

  opts = opts || {}
  opts = _.defaults(opts, {
    namespace: DEFAULT.NAMESPACE,
    cleanupInterval: DEFAULT.CLEANUP_INTERVAL
  })

  if (!opts.jwtSecret) {
    throw new Error('jwtSecret is required')
  }

  _this.redis = new Redis()
  _this.namespace = opts.namespace
  _this.jwtSecret = opts.jwtSecret

  _this.cleanupIntervalId = setInterval(function () {
    _this.cleanup()
  }, opts.cleanupInterval)
}

/**
* @method create
* @param {Object} opts {
*   userId: [String|Number}
*   [ttl]: Number in second
*   ip: String
* }
*/
TokenSession.prototype.create = function (opts) {
  opts = opts || {}
  opts = _.defaults(opts, {
    ttl: DEFAULT.TTL
  })

  if (!opts.userId) {
    return Promise.reject(new Error('userId is required'))
  }

  if (!_.isNumber(opts.ttl)) {
    return Promise.reject(new Error('ttl is required and should be a Number'))
  }

  // create JWT token
  var token = jwt.sign({
    userId: opts.userId
  }, this.jwtSecret, {
    expiresInSeconds: opts.ttl
  })

  var namespace = PREFIX.NAMESPACE + this.namespace
  var userKey = PREFIX.USER + this.userId
  var tokenListKey = namespace + PREFIX.token + 'list'
  var tokenListValue = opts.userId + ':' + token
  var tokenKey = namespace + PREFIX.TOKEN + token

  var expiresAt = Date.now() + (opts.ttl * 1000)
  var tokenPayload = {
    ttl: opts.ttl
  }

  if (opts.ip) {
    tokenPayload.ip = opts.ip
  }

  this.redis
    .multi(tokenListKey, expiresAt)

    // add token to the list by score
    // order by score makes easy to get and remove expired ones
    .zadd(tokenKey, expiresAt, tokenListValue)

    // add token to user
    .sadd(userKey, token)

    // store token props
    .hmset(tokenKey, tokenPayload)
}

/**
* @method cleanup
*/
TokenSession.prototype.cleanup = function () {
  // TODO: ZRANGEBYSCORE, get expired ones
  // TODO: remove expired ones from token list (get token -> split list value by :)
  // TODO: remove expired ones from user (get userId -> split list value by :)
}

module.exports = TokenSession
