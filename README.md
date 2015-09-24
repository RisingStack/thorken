# token-session

`Redis` and `JWT` token based session manager.

## Usage

### Configure

```
var TokenSession = require('token-session')
var session = new TokenSession({
  jwtSecret: 'secret',
  [namespace]: 'ts',
  [redis]: ioredisInstance,
  [cleanupManual]: false
})

```

### Create

```
session.create({
  userId: '1',
  [ttl]: 7200,
  [ip]: '127.0.0.1'
})
.then(function (jwtToken) { ... })
```

### Cleanup

For manual cleanup.

To clear only expired sessions
```
session.cleanup(true).then(function () { ... })
```

To clear every session
```
session.cleanup(true).then(function () { ... })
```
