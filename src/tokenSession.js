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
*   uid: String
*   [ttl]: Number in second
*   [ip]: String
* }
* @return {String} token, jwt
*/
TokenSession.prototype.create = function (opts) {
  var _this = this

  opts = opts || {}
  opts = _.defaults(opts, {
    ttl: DEFAULT.TTL
  })

  if (!opts.uid) {
    return Promise.reject(new Error('uid is required'))
  }

  if (!_.isNumber(opts.ttl)) {
    return Promise.reject(new Error('ttl is required and should be a Number'))
  }

  opts.uid = String(opts.uid)

  // create JWT token
  var token = jwt.sign({
    uid: opts.uid,
    ts: Date.now()
  }, _this.jwtSecret)

  var userKey = _this.namespaceKey + PREFIX.USER + opts.uid
  var tokenListKey = _this.namespaceKey + PREFIX.TOKEN + 'list'
  var tokenListValue = opts.uid + ':' + token
  var tokenKey = _this.namespaceKey + PREFIX.TOKEN + token

  var expiresAt = Date.now() + (opts.ttl * 1000)
  var tokenPayload = {
    uid: opts.uid,
    exp: expiresAt
  }

  if (opts.ip) {
    tokenPayload.ip = opts.ip
  }

  return _this.redis
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
      return _this.redis.pexpireat(tokenKey, expiresAt)
        .then(function (result) {
          if (result !== 1) {
            throw new Error('cannot set expiration on token')
          }

          return token
        })
    })
}

/**
* Get token properties
* @method get
*/
TokenSession.prototype.get = function (token) {
  var _this = this
  var tokenKey = _this.namespaceKey + PREFIX.TOKEN + token

  return Promise.all([
    TokenSession.jwtVerify(token, _this.jwtSecret),
    _this.redis.hgetall(tokenKey)
  ])
    .then(function (results) {
      var props = results[1]

      if (_.isEqual(props, {})) {
        throw new Error('unknown token')
      }

      return results[1]
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
          .zremrangebyscore(tokenListKey, 0, to)

        if (cleanupAll) {
          multi = multi.del(tokenKeys)
        }

        // remove tokens from users
        expiredItems.forEach(function (item) {
          var tmp = item.split(':')
          var uid = tmp[0]
          var token = tmp[1]
          var userKey = _this.namespaceKey + PREFIX.USER + uid

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

/**
* @method jwtVerify
* @param {String} token
*/
TokenSession.jwtVerify = function () {
  var args = Array.prototype.slice.call(arguments)

  return new Promise(function (resolve, reject) {
    args.push(function (err, payload) {
      if (err) {
        return reject(err)
      }

      resolve(payload)
    })

    jwt.verify.apply(jwt, args)
  })
}

module.exports = TokenSession
