# thorken
[ ![Codeship Status for RisingStack/thorken](https://codeship.com/projects/f14d16b0-44c7-0133-4946-4686174fbfc9/status?branch=master)](https://codeship.com/projects/104466)  

`Redis` and `JWT` token based session manager.

## Usage

You need [redis](http://redis.io) to use this package.  

`npm install --save thorken`

### Configure

```javascript
var Thorken = require('thorken')
var session = new Thorken({
  jwtSecret: 'secret',
  [namespace]: 'ts',
  [redis]: ioredisInstance,
  [cleanupManual]: false
})

```

### Create

```javascript
session.create({
  uid: '1',
  [ttl]: 7200,
  [ip]: '127.0.0.1'
})
.then(function (jwtToken) { ... })
```

### Get

```javascript
session.get('token')
.then(function (session) { ... })
```

### Extend

The second ttl parameter is optional.

```javascript
session.extend('token', 7200)
.then(function (expiresAt) { ... })
```

### Destroy

```javascript
session.destroy('token')
.then(function (isSuccess) { ... })
```

### Cleanup

For manual cleanup.

To clear only expired sessions

```javascript
session.cleanup().then(function () { ... })
```

To clear every session

```javascript
session.cleanup(true).then(function () { ... })
```

### Get user's sessions

```javascript
session.getByUserId('1').then(function (sessions) { ... })
```

### Destroy user's sessions

```javascript
session.destroyUser('1').then(function (isSuccess) { ... })
```

## Server connectors

### Koa middleware

```javascript
var app = require('koa')()
var Thorken = require('thorken')
var protect = require('thorken/src/koa')
var session = new Thorken({ ... })

app.use(protect(session, {
  [extend]: true
}))
```
