var expect = require('chai').expect

var middleware = require('./koa')
var Thorken = require('../../index')

describe('koa middleware', () => {
  var thorken
  var next
  var ctx

  beforeEach(function () {
    thorken = new Thorken({
      jwtSecret: 'secret'
    })

    // koa mocks
    next = function *() {}

    ctx = {
      headers: {
        authorization: 'Bearer token'
      },
      state: {
        user: {}
      }
    }
  })

  it('should validate and extend token and set state', function *() {
    var getStub = this.sandbox.stub(thorken, 'get').returnsWithResolve({
      uid: '1'
    })
    var extendStub = this.sandbox.stub(thorken, 'extend').returnsWithResolve()
    var mw = middleware(thorken)

    yield mw.call(ctx, next)

    expect(getStub).to.be.calledWith('token')
    expect(extendStub).to.be.calledWith('token')

    expect(ctx.state).to.be.eql({
      user: {
        id: '1'
      }
    })
  })

  it('should not extend token', function *() {
    this.sandbox.stub(thorken, 'get').returnsWithResolve({
      uid: '1'
    })
    var extendStub = this.sandbox.stub(thorken, 'extend').returnsWithResolve()

    var mw = middleware(thorken, {
      extend: false
    })

    yield mw.call(ctx, next)

    expect(extendStub).to.be.not.called
  })

  it('should return with unauthorized', function *() {
    this.sandbox.stub(thorken, 'get').returnsWithReject(new Error('invalid token'))
    var extendStub = this.sandbox.stub(thorken, 'extend').returnsWithResolve()

    var mw = middleware(thorken)

    try {
      yield mw.call(ctx, next)
    } catch (err) {
      expect(extendStub).to.be.not.called
      expect(err.message).to.be.eql('invalid token')
      return
    }

    throw new Error('uncatched error')
  })
})
