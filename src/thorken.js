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
* @class Thorken
* @param {Object} opts {
*  [namespace]: String,
*  [redis]: Redis, ioredis instance,
*  jwtSecret: String,
*  [cleanupManual]: Boolean, default: false
* }
*/
function Thorken (opts) {
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
Thorken.prototype.create = function (opts) {
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
Thorken.prototype.get = function (token) {
  var _this = this
  var tokenKey = _this.namespaceKey + PREFIX.TOKEN + token

  return Promise.all([
    Thorken.jwtVerify(token, _this.jwtSecret),
    _this.redis.hgetall(tokenKey)
  ])
    .then(function (results) {
      var props = results[1]

      if (_.isEqual(props, {})) {
        throw new Error('unknown token')
      }

      props.exp = Number(props.exp)

      return results[1]
    })
}

/**
* Extend token's expiration
* @method extend
*/
Thorken.prototype.extend = function (token, ttl) {
  ttl = _.isNumber(ttl) ? ttl : DEFAULT.TTL

  var _this = this

  return _this.get(token)
    .then(function (props) {
      var tokenKey = _this.namespaceKey + PREFIX.TOKEN + token
      var expiresAt = Date.now() + (ttl * 1000)

      props.exp = expiresAt

      return _this.redis
        .multi()
        .hmset(tokenKey, props)
        .pexpireat(tokenKey, expiresAt)
        .exec()
        .then(function () {
          return expiresAt
        })
    })
}

/**
* Destory token
* @method destroy
*/
Thorken.prototype.destroy = function (token) {
  var _this = this
  var tokenKey = _this.namespaceKey + PREFIX.TOKEN + token
  var tokenPayload = jwt.verify(token, _this.jwtSecret)
  var tokenListKey = _this.namespaceKey + PREFIX.TOKEN + 'list'
  var userKey = _this.namespaceKey + PREFIX.USER + tokenPayload.uid
  var tokenListValue = tokenPayload.uid + ':' + token

  return this.redis
    .multi()
    .del(tokenKey)
    .srem(userKey, token)
    .zrem(tokenListKey, tokenListValue)
    .exec()
    .then(function (results) {
      return results[0][1] === 1
    })
}

/**
* Destory token
* @method destroyUser
*/
Thorken.prototype.destroyUser = function (uid) {
  var _this = this
  var userKey = _this.namespaceKey + PREFIX.USER + uid
  var tokenListKey = _this.namespaceKey + PREFIX.TOKEN + 'list'

  return _this.redis.smembers(userKey)
    .then(function (tokens) {
      var keysForDel = tokens.map(function (token) {
        return _this.namespaceKey + PREFIX.TOKEN + token
      })

      keysForDel.push(userKey)

      var listMembers = tokens.map(function (token) {
        return uid + ':' + token
      })

      return _this.redis.multi()
        .del(keysForDel)
        .zrem(tokenListKey, listMembers)
        .exec()
        .then(function (results) {
          return results.every(function (result) {
            return result[0] === null
          })
        })
    })
}

/**
* Remove expired tokens
* @method cleanup
*/
Thorken.prototype.cleanup = function (cleanupAll) {
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
Thorken.jwtVerify = function () {
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

module.exports = Thorken
