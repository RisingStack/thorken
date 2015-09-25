var http = require('http')
var koa = require('koa')
var request = require('co-supertest')

var Thorken = require('../../index.js')
var middleware = require('./koa')

describe('koa middleware e2e', () => {
  var token
  var thorken

  before(function *() {
    thorken = new Thorken({
      jwtSecret: 'secret'
    })

    token = yield thorken.create({
      uid: '1'
    })
  })

  after(function *() {
    yield thorken.cleanup(true)
  })

  it('should accept token', function *() {
    var app = koa()
    app.use(middleware(thorken))
    app.use(function *() {
      this.body = 'hello'
    })

    var server = http.createServer(app.callback())

    yield request(server)
      .get('/')
      .set('Authorization', `Bearer ${token}`)
      .expect(200, 'hello')
  })

  it('should reject token', function *() {
    var app = koa()
    app.use(middleware(thorken))
    app.use(function *() {
      this.body = 'hello'
    })

    var server = http.createServer(app.callback())

    yield request(server)
      .get('/')
      .set('Authorization', `Bearer a.b.c`)
      .expect(401)
  })
})
