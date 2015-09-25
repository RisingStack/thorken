var Redis = require('ioredis')
var expect = require('chai').expect
var jwt = require('jsonwebtoken')

var Thorken = require('../index.js')

describe('e2e', () => {
  var redis = new Redis({
    db: 1
  })

  var thorken = new Thorken({
    redis: redis,
    cleanupManual: true,
    jwtSecret: 'secret'
  })

  before(function *() {
    yield redis.flushall()
  })

  describe('#create', () => {
    it('should create a session', function *() {
      var expireAt = Date.now() + 7200000
      var token = yield thorken.create({
        uid: '1'
      })

      var tokenPayload = yield jwt.verify(token, 'secret')
      var props = yield redis.hgetall(thorken.namespaceKey + 't:' + token)

      expect(tokenPayload).to.have.property('uid', '1')

      expect(props).to.have.property('uid', '1')
      expect(props).to.have.property('exp')
      expect(Number(props.exp)).to.be.at.least(expireAt)
    })

    it('should create a session which expires', function *() {
      var token = yield thorken.create({
        uid: '1'
      })

      var ttl = yield redis.pttl(thorken.namespaceKey + 't:' + token)

      expect(ttl).to.be.above(7198000)
      expect(ttl).to.be.below(7200000)
    })

    afterEach(function *() {
      yield redis.flushall()
    })
  })

  describe('#extend', () => {
    var token

    beforeEach(function *() {
      token = yield thorken.create({
        uid: '1',
        ttl: 2
      })
    })

    it('should extend a session expiration', function *() {
      var expireAt = Date.now() + 7200000

      yield thorken.extend(token)

      // expect
      var tokenKey = thorken.namespaceKey + 't:' + token
      var props = yield redis.hgetall(tokenKey)
      var ttl = yield redis.pttl(tokenKey)

      expect(ttl).to.be.above(7198000)
      expect(ttl).to.be.below(7200000)

      expect(Number(props.exp)).to.be.at.least(expireAt)
    })

    it('should handle if token is invalid', function *() {
      try {
        yield thorken.extend('a.a.b')
      } catch (err) {
        expect(err.message).to.be.equal('invalid token')
        return
      }

      throw new Error('unhandled error')
    })

    afterEach(function *() {
      yield redis.flushall()
    })
  })

  describe('#get', () => {
    var token

    beforeEach(function *() {
      token = yield thorken.create({
        uid: '1',
        ip: '192.168.1.1'
      })
    })

    it('should return with session', function *() {
      var props = yield thorken.get(token)

      expect(props).to.have.property('uid', '1')
      expect(props).to.have.property('ip', '192.168.1.1')
    })

    it('should reject malformed token', function *() {
      try {
        yield thorken.get('invalid token')
      } catch (err) {
        expect(err.message).to.be.equal('jwt malformed')
        return
      }

      throw new Error('unhandled error')
    })

    it('should reject invalid token', function *() {
      try {
        yield thorken.get('a.a.b')
      } catch (err) {
        expect(err.message).to.be.equal('invalid token')
        return
      }

      throw new Error('unhandled error')
    })

    it('should reject unknown token', function *() {
      var token = jwt.sign({
        uid: '1'
      }, thorken.jwtSecret)

      try {
        yield thorken.get(token)
      } catch (err) {
        expect(err.message).to.be.equal('unknown token')
        return
      }

      throw new Error('unhandled error')
    })

    afterEach(function *() {
      yield redis.flushall()
    })
  })

  describe('#destroy', () => {
    var token

    beforeEach(function *() {
      token = yield thorken.create({
        uid: '1'
      })
    })

    it('should return with session', function *() {
      var iSuccess = yield thorken.destroy(token)

      // expect
      var userTokens = yield redis.smembers(thorken.namespaceKey + 'u:1')
      var tokens = yield redis.zrangebyscore(thorken.namespaceKey + 't:list', 0, '+inf')
      var props = yield redis.hgetall(thorken.namespaceKey + 't:' + token)

      expect(iSuccess).to.be.true
      expect(userTokens).to.be.eql([])
      expect(tokens).to.be.eql([])
      expect(props).to.be.eql({})
    })

    afterEach(function *() {
      yield redis.flushall()
    })
  })

  describe('#destroy user', () => {
    var token1
    var token3

    beforeEach(function *() {
      token1 = yield thorken.create({
        uid: '1'
      })

      yield thorken.create({
        uid: '1'
      })

      token3 = yield thorken.create({
        uid: '2'
      })
    })

    it('should remove user and user\'s tokens', function *() {
      var iSuccess = yield thorken.destroyUser('1')

      // expect
      var userTokens = yield redis.smembers(thorken.namespaceKey + 'u:1')
      var tokens = yield redis.zrangebyscore(thorken.namespaceKey + 't:list', 0, '+inf')
      var props = yield redis.hgetall(thorken.namespaceKey + 't:' + token1)

      expect(iSuccess).to.be.true
      expect(userTokens).to.be.eql([])
      expect(tokens).to.be.eql([
        '2:' + token3
      ])
      expect(props).to.be.eql({})
    })

    afterEach(function *() {
      yield redis.flushall()
    })
  })

  describe('#cleanup', () => {
    beforeEach(function *() {
      yield thorken.create({
        uid: '1',
        ttl: 0
      })
    })

    it('should remove all sessions', function *() {
      yield thorken.cleanup(true)

      var key = yield redis.randomkey()

      expect(key).to.be.null
    })

    it('should remove expired sessions', function *() {
      yield thorken.cleanup()

      var key = yield redis.randomkey()

      expect(key).to.be.null
    })

    it('should remove only expired sessions', function *() {
      var token2 = yield thorken.create({
        uid: '1'
      })

      yield thorken.cleanup()

      var tokens = yield redis.smembers(thorken.namespaceKey + 'u:1')

      expect(tokens).to.be.eql([
        token2
      ])
    })
  })
})
