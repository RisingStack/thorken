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
      var token = yield session.create({
        userId: '1'
      })

      var userId = yield jwt.verify(token, 'secret')
      var props = yield redis.hgetall(session.namespaceKey + 't:' + token)

      expect(userId).to.have.property('userId', '1')

      expect(props).to.be.eql({
        ttl: '7200',
        uid: '1'
      })
    })

    afterEach(function *() {
      yield redis.flushall()
    })
  })

  describe('#cleanup', () => {
    var token1

    beforeEach(function *() {
      token1 = yield session.create({
        userId: '1',
        ttl: -1
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
        userId: '2'
      })

      yield session.cleanup()

      var props1 = yield redis.hgetall(session.namespaceKey + 't:' + token1)
      var props2 = yield redis.hgetall(session.namespaceKey + 't:' + token2)

      expect(props1).to.be.eql({})

      expect(props2).to.be.eql({
        ttl: '7200',
        uid: '2'
      })
    })
  })
})
