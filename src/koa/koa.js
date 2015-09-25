var _ = require('lodash')
var Thorken = require('../thorken')

/**
* @method factory
* @param {Thorken} thorken
* @param {Object} opts {
*   [extend]: true
* }
* @return {Generator} middleware
*/
function factory (thorken, opts) {
  var options = _.defaults(opts || {}, {
    extend: true
  })

  if (!(thorken instanceof Thorken)) {
    throw new Error('instance of Thorken is required')
  }

  // middleware
  return function *(next) {
    var token = (this.headers.authorization || '').substring(7)
    var session

    // get session
    try {
      session = yield thorken.get(token)
    } catch (err) {
      err.status = 401
      throw err
    }

    // extend token's expiration
    if (options.extend) {
      yield thorken.extend(token)
    }

    this.state.user = _.merge(this.state.user, {
      id: session.uid
    })

    yield next
  }
}

module.exports = factory
