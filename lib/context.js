'use strict'

/**
 * Module dependencies.
 */

const util = require('util')
const createError = require('http-errors')
const httpAssert = require('http-assert')
const delegate = require('delegates')
const statuses = require('statuses')
const Cookies = require('cookies')

const COOKIES = Symbol('context#cookies')

/**
 * Context prototype.
 */

const proto = module.exports = {

  /**
   * util.inspect（） 实现，其中
   * 仅返回 JSON 输出。
   *
   * @return {Object}
   * @api公众
   */

  inspect () {
    if (this === proto) return this
    return this.toJSON()
  },

  /**
   * 返回 JSON 表示形式。
   *
   * 在这里，我们在每个
   * 对象，否则迭代将失败
   * 添加到 getter 中，并导致
   * clone（） 失败。
   *
   * @return {Object}
   * @api公众
   */

  toJSON () {
    return {
      request: this.request.toJSON(),
      response: this.response.toJSON(),
      app: this.app.toJSON(),
      originalUrl: this.originalUrl,
      req: '<original node req>',
      res: '<original node res>',
      socket: '<original node socket>'
    }
  },

  /**
   * 与 .throw（） 类似，添加断言。
   *
   *    this.assert（this.user， 401， '请登录！'）;
   *
   * 另请： https://github.com/jshttp/http-assert
   *
   * @param {混合} 测试
   * @param {Number} 状态
   * @param {String} 消息
   * @api公众
   */

  assert: httpAssert,

  /**
   * 抛出 'status' 错误（默认为 500）和
   * 'msg' 来获取。请注意，这些是用户级别的
   * 错误，并且该消息可能会暴露给客户端。
   *
   *    this.throw（403）
   *    this.throw（400， '需要名称'）
   *    this.throw（'爆炸了'）
   *    this.throw（new 错误（'无效'））
   *    this.throw（400， new Error（'invalid'））
   *
   * 另请： https://github.com/jshttp/http-errors
   *
   * 注意： 'status' 只能作为第一个参数传递。
   *
   * @param {string|数量|错误} err、msg 或状态
   * @param {string|数量|错误} [错误、消息或状态]
   * @param {Object} [props]
   * @api公众
   */

  throw (...args) {
    throw createError(...args)
  },

  /**
   * Default error handling.
   *
   * @param {Error} err
   * @api private
   */

  onerror (err) {
    // 如果没有错误，则不执行任何操作。
// 这允许您传递 'this.onerror'
// 设置为 Node 样式的回调。
    if (err == null) return

    // 当处理跨全局变量时，正常的 'instanceof' 检查无法正常工作。
// 查看 https://github.com/koajs/koa/issues/1466
// 一旦 jest 修复 https://github.com/facebook/jest/issues/2549，我们或许可以删除它。
    const isNativeError =
      Object.prototype.toString.call(err) === '[object Error]' ||
      err instanceof Error
    if (!isNativeError) err = new Error(util.format('non-error thrown: %j', err))

    let headerSent = false
    if (this.headerSent || !this.writable) {
      headerSent = err.headerSent = true
    }

    // delegate
    this.app.emit('error', err, this)

    // 我们在这里无能为力
// than 委托给应用程序级别
// handler 和 log 的 Controller。
    if (headerSent) {
      return
    }

    const { res } = this

    // first unset all headers
    /* istanbul ignore else */
    if (typeof res.getHeaderNames === 'function') {
      res.getHeaderNames().forEach(name => res.removeHeader(name))
    } else {
      res._headers = {} // Node < 7.7
    }

    // then set those specified
    this.set(err.headers)

    // force text/plain
    this.type = 'text'

    let statusCode = err.status || err.statusCode

    // ENOENT support
    if (err.code === 'ENOENT') statusCode = 404

    // default to 500
    if (typeof statusCode !== 'number' || !statuses[statusCode]) statusCode = 500

    // respond
    const code = statuses[statusCode]
    const msg = err.expose ? err.message : code
    this.status = err.status = statusCode
    this.length = Buffer.byteLength(msg)
    res.end(msg)
  },

  get cookies () {
    if (!this[COOKIES]) {
      this[COOKIES] = new Cookies(this.req, this.res, {
        keys: this.app.keys,
        secure: this.request.secure
      })
    }
    return this[COOKIES]
  },

  set cookies (_cookies) {
    this[COOKIES] = _cookies
  }
}

/**
 * 较新 Node.js 版本的自定义检查实施。
 *
 * @return {Object}
 * @api公众
 */
/* 伊斯坦布尔忽略其他*/
if (util.inspect.custom) {
  module.exports[util.inspect.custom] = module.exports.inspect
}

/**
 * Response delegation.
 */

delegate(proto, 'response')
  .method('attachment')
  .method('redirect')
  .method('remove')
  .method('vary')
  .method('has')
  .method('set')
  .method('append')
  .method('flushHeaders')
  .access('status')
  .access('message')
  .access('body')
  .access('length')
  .access('type')
  .access('lastModified')
  .access('etag')
  .getter('headerSent')
  .getter('writable')

/**
 * Request delegation.
 */

delegate(proto, 'request')
  .method('acceptsLanguages')
  .method('acceptsEncodings')
  .method('acceptsCharsets')
  .method('accepts')
  .method('get')
  .method('is')
  .access('querystring')
  .access('idempotent')
  .access('socket')
  .access('search')
  .access('method')
  .access('query')
  .access('path')
  .access('url')
  .access('accept')
  .getter('origin')
  .getter('href')
  .getter('subdomains')
  .getter('protocol')
  .getter('host')
  .getter('hostname')
  .getter('URL')
  .getter('header')
  .getter('headers')
  .getter('secure')
  .getter('stale')
  .getter('fresh')
  .getter('ips')
  .getter('ip')
