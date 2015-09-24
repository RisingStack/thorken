# token-session
[ ![Codeship Status for RisingStack/token-session](https://codeship.com/projects/f14d16b0-44c7-0133-4946-4686174fbfc9/status?branch=master)](https://codeship.com/projects/104466)  

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
