# thorken
[ ![Codeship Status for RisingStack/thorken](https://codeship.com/projects/f14d16b0-44c7-0133-4946-4686174fbfc9/status?branch=master)](https://codeship.com/projects/104466)  

`Redis` and `JWT` token based session manager.

## Usage

### Configure

```javascript
var TokenSession = require('thorken')
var session = new TokenSession({
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
session.cleanup(true).then(function () { ... })
```

To clear every session

```javascript
session.cleanup(true).then(function () { ... })
```

### Get user's sessions

// TODO

### Destroy user's sessions

// TODO
