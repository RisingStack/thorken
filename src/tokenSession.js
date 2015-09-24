var _ = require('lodash')
var Redis = require('ioredis')
var jwt = require('jsonwebtoken')
var Promise = require('promise')

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
*  [redis]: Redis, ioredis instance,
*  jwtSecret: String,
*  [cleanupManual]: Boolean, default: false
* }
*/
function TokenSession (opts) {
  var _this = this

  opts = opts || {}
  opts = _.defaults(opts, {
    namespace: DEFAULT.NAMESPACE,
    cleanupInterval: DEFAULT.CLEANUP_INTERVAL,
    cleanupManual: false
  })

  if (!opts.jwtSecret) {
    throw new Error('jwtSecret is required')
  }

  _this.redis = opts.redis || new Redis()
  _this.namespace = opts.namespace
  _this.namespaceKey = PREFIX.NAMESPACE + _this.namespace + ':'
  _this.jwtSecret = opts.jwtSecret

  if (!opts.cleanupManual) {
    _this.cleanupIntervalId = setInterval(function () {
      _this.cleanup()
    }, opts.cleanupInterval)
  }
}

/**
* @method create
* @param {Object} opts {
*   userId: [String|Number}
*   [ttl]: Number in second
*   ip: String
* }
* @return {String} token, jwt
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

  var userKey = this.namespaceKey + PREFIX.USER + opts.userId
  var tokenListKey = this.namespaceKey + PREFIX.TOKEN + 'list'
  var tokenListValue = opts.userId + ':' + token
  var tokenKey = this.namespaceKey + PREFIX.TOKEN + token

  var expiresAt = Date.now() + (opts.ttl * 1000)
  var tokenPayload = {
    uid: opts.userId,
    ttl: opts.ttl
  }

  if (opts.ip) {
    tokenPayload.ip = opts.ip
  }

  return this.redis
    .multi()

    // add token to the list by score
    // order by score makes easy to get and remove expired ones
    .zadd(tokenListKey, expiresAt, tokenListValue)

    // add token to user
    .sadd(userKey, token)

    // store token props
    .hmset(tokenKey, tokenPayload)
    .exec()
    .then(function () {
      return token
    })
}

/**
* Remove expired tokens
* @method cleanup
*/
TokenSession.prototype.cleanup = function (cleanupAll) {
  var _this = this
  var tokenListKey = _this.namespaceKey + PREFIX.TOKEN + 'list'
  var to = Date.now()

  if (cleanupAll) {
    to = '+inf'
  }

  return this.redis

    // get expired tokens
    .zrangebyscore(tokenListKey, 0, to)
      .then(function (expiredItems) {
        // extract token keys from expired items
        var tokenKeys = expiredItems.map(function (item) {
          var tmp = item.split(':')
          var token = tmp[1]
          var tokenKey = _this.namespaceKey + PREFIX.TOKEN + token

          return tokenKey
        })

        // remove from token list and token properties
        var multi = _this.redis.multi()
          .del(tokenKeys)
          .zremrangebyscore(tokenListKey, 0, to)

        // remove tokens from users
        expiredItems.forEach(function (item) {
          var tmp = item.split(':')
          var userId = tmp[0]
          var token = tmp[1]
          var userKey = _this.namespaceKey + PREFIX.USER + userId

          multi = multi.srem(userKey, token)
        })

        // return with number of removed tokens
        return multi
          .exec()
          .then(function (results) {
            return results[0]
          })
      })
}

module.exports = TokenSession
