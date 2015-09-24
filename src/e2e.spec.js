var Redis = require('ioredis')
var expect = require('chai').expect
var jwt = require('jsonwebtoken')

var TokenSession = require('./tokenSession')

describe('e2e', () => {
  var redis = new Redis({
    db: 1
  })

  var session = new TokenSession({
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
      var token = yield session.create({
        uid: '1'
      })

      var tokenPayload = yield jwt.verify(token, 'secret')
      var props = yield redis.hgetall(session.namespaceKey + 't:' + token)

      expect(tokenPayload).to.have.property('uid', '1')

      expect(props).to.have.property('uid', '1')
      expect(props).to.have.property('exp')
      expect(Number(props.exp)).to.be.at.least(expireAt)
    })

    it('should create a session which expires', function *() {
      var token = yield session.create({
        uid: '1'
      })

      var ttl = yield redis.pttl(session.namespaceKey + 't:' + token)

      expect(ttl).to.be.above(7198000)
      expect(ttl).to.be.below(7200000)
    })

    afterEach(function *() {
      yield redis.flushall()
    })
  })

  describe('#cleanup', () => {
    beforeEach(function *() {
      yield session.create({
        uid: '1',
        ttl: 0
      })
    })

    it('should remove all sessions', function *() {
      yield session.cleanup(true)

      var key = yield redis.randomkey()

      expect(key).to.be.null
    })

    it('should remove expired sessions', function *() {
      yield session.cleanup()

      var key = yield redis.randomkey()

      expect(key).to.be.null
    })

    it('should remove only expired sessions', function *() {
      var token2 = yield session.create({
        uid: '1'
      })

      yield session.cleanup()

      var tokens = yield redis.smembers(session.namespaceKey + 'u:1')

      expect(tokens).to.be.eql([
        token2
      ])
    })
  })
})
