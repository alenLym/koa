'use strict'

/**
 * Module dependencies.
 */

const debug = require('debug')('koa:application')
const assert = require('assert')
const onFinished = require('on-finished')
const response = require('./response')
const compose = require('koa-compose')
const context = require('./context')
const request = require('./request')
const statuses = require('statuses')
const Emitter = require('events')
const util = require('util')
const Stream = require('stream')
const http = require('http')
const only = require('./only.js')
const { HttpError } = require('http-errors')

/** @typedef {typeof import （'./context'） & {
 *  app： 应用程序
 *  req： import（'http'） 来获取。传入消息
 *  res： import（'http'） 的服务器响应
 *  请求：KoaRequest
 *  响应： KoaResponse
 *  状态：任意
 *  originalUrl：字符串
 * }} 上下文*/
/** @typedef {typeof import（'./request'）} KoaRequest*/
/** @typedef {typeof import（'./response'）} KoaResponse*/
/**
 * 公开 'Application' 类。
 * 继承自 'Emitter.prototype'。
 */

module.exports = class Application extends Emitter {
  /**
   * Initialize a new `Application`.
   *
   * @api public
   */

  /**
    *
    * @param {object} [选项] 应用程序选项
    * @param {string} [options.env=] 环境
    * @param {string[]} [options.keys] 签名的 cookie 密钥
    * @param {boolean} [options.proxy] 信任代理标头
    * @param {number} [options.subdomainOffset] 子域偏移量
    * @param {string} [options.proxyIpHeader] 代理 IP 头，默认为 X-Forwarded-For
    * @param {number} [options.maxIpsCount] 从代理 IP 标头读取的最大 IP 数，默认为 0（表示无穷大）
    * @param {function} [options.compose] 处理中间件组合的函数
    * @param {boolean} [options.asyncLocalStorage] 从代理 IP 标头读取的最大 IP 数，默认为 0（表示无穷大）
    *
    */

  constructor (options) {
    super()
    options = options || {}
    this.proxy = options.proxy || false
    this.subdomainOffset = options.subdomainOffset || 2
    this.proxyIpHeader = options.proxyIpHeader || 'X-Forwarded-For'
    this.maxIpsCount = options.maxIpsCount || 0
    this.env = options.env || process.env.NODE_ENV || 'development'
    this.compose = options.compose || compose
    if (options.keys) this.keys = options.keys
    this.middleware = []
    this.context = Object.create(context)
    this.request = Object.create(request)
    this.response = Object.create(response)
    // 对节点 6+ 的 util.inspect.custom 支持
    /* istanbul ignore else */
    if (util.inspect.custom) {
      this[util.inspect.custom] = this.inspect
    }
    if (options.asyncLocalStorage) {
      const { AsyncLocalStorage } = require('async_hooks')
      assert(AsyncLocalStorage, 'Requires node 12.17.0 or higher to enable asyncLocalStorage')
      this.ctxStorage = new AsyncLocalStorage()
    }
  }

  /**
   * 简写：
   *
   *    http.createServer（app.callback（））.listen（...）
   *
   * @param {混合} ...
   * @return {import（'http'） 中。服务器}
   * @api公众
   */

  listen (...args) {
    debug('listen')
    const server = http.createServer(this.callback())
    return server.listen(...args)
  }

  /**
   * 返回 JSON 表示形式。
   * 我们只费心显示设置。
   *
   * @return {Object}
   * @api公众
   */

  toJSON () {
    return only(this, [
      'subdomainOffset',
      'proxy',
      'env'
    ])
  }

  /**
   * 检查实施情况。
   *
   * @return {Object}
   * @api公众
   */

  inspect () {
    return this.toJSON()
  }

  /**
   * 使用给定的中间件 'fn'。
   *
   * 旧式中间件将被转换。
   *
   * @param {（context： context） => Promise<any | void>} fn
   * @return {Application} self
   * @api公众
   */

  use (fn) {
    if (typeof fn !== 'function') throw new TypeError('middleware must be a function!')
    debug('use %s', fn._name || fn.name || '-')
    this.middleware.push(fn)
    return this
  }

  /**
   * 返回请求处理程序回调
   * 对于 Node 的本机 HTTP 服务器。
   *
   * @return {功能}
   * @api公众
   */

  callback () {
    const fn = this.compose(this.middleware)

    if (!this.listenerCount('error')) this.on('error', this.onerror)

    const handleRequest = (req, res) => {
      const ctx = this.createContext(req, res)
      if (!this.ctxStorage) {
        return this.handleRequest(ctx, fn)
      }
      return this.ctxStorage.run(ctx, async () => {
        return await this.handleRequest(ctx, fn)
      })
    }

    return handleRequest
  }

  /**
   * 从异步本地存储返回当前上下文
   */
  get currentContext () {
    if (this.ctxStorage) return this.ctxStorage.getStore()
  }

  /**
   * 在 callback 中处理请求。
   *
   * @api 私有
   */

  handleRequest (ctx, fnMiddleware) {
    const res = ctx.res
    res.statusCode = 404
    const onerror = err => ctx.onerror(err)
    const handleResponse = () => respond(ctx)
    onFinished(res, onerror)
    return fnMiddleware(ctx).then(handleResponse).catch(onerror)
  }

  /**
   * 初始化新上下文。
   *
   * @api 私有
   */

  createContext (req, res) {
    /** @type {Context} */
    const context = Object.create(this.context)
    /** @type {KoaRequest} */
    const request = context.request = Object.create(this.request)
    /** @type {KoaResponse} */
    const response = context.response = Object.create(this.response)
    context.app = request.app = response.app = this
    context.req = request.req = response.req = req
    context.res = request.res = response.res = res
    request.ctx = response.ctx = context
    request.response = response
    response.request = request
    context.originalUrl = request.originalUrl = req.url
    context.state = {}
    return context
  }

  /**
   * 默认错误处理程序。
   *
   * @param {Error} err
   * @api 私有
   */

  onerror (err) {
    // 当处理跨全局变量时，正常的 'instanceof' 检查无法正常工作。
// 查看 https://github.com/koajs/koa/issues/1466
// 一旦 jest 修复 https://github.com/facebook/jest/issues/2549，我们或许可以删除它。
    const isNativeError =
      Object.prototype.toString.call(err) === '[object Error]' ||
      err instanceof Error
    if (!isNativeError) throw new TypeError(util.format('non-error thrown: %j', err))

    if (err.status === 404 || err.expose) return
    if (this.silent) return

    const msg = err.stack || err.toString()
    console.error(`\n${msg.replace(/^/gm, '  ')}\n`)
  }

  /**
   * 帮助 TS 用户遵守 CommonJS、ESM、bundler 不匹配。
   * @see https://github.com/koajs/koa/issues/1513
   */

  static get default () {
    return Application
  }
}

/**
 * 响应帮助程序。
 */

function respond (ctx) {
  // allow bypassing koa
  if (ctx.respond === false) return

  if (!ctx.writable) return

  const res = ctx.res
  let body = ctx.body
  const code = ctx.status

  // ignore body
  if (statuses.empty[code]) {
    // 条形接头
    ctx.body = null
    return res.end()
  }

  if (ctx.method === 'HEAD') {
    if (!res.headersSent && !ctx.response.has('Content-Length')) {
      const { length } = ctx.response
      if (Number.isInteger(length)) ctx.length = length
    }
    return res.end()
  }

  // 状态 body
  if (body === null || body === undefined) {
    if (ctx.response._explicitNullBody) {
      ctx.response.remove('Content-Type')
      ctx.response.remove('Transfer-Encoding')
      ctx.length = 0
      return res.end()
    }
    if (ctx.req.httpVersionMajor >= 2) {
      body = String(code)
    } else {
      body = ctx.message || String(code)
    }
    if (!res.headersSent) {
      ctx.type = 'text'
      ctx.length = Buffer.byteLength(body)
    }
    return res.end(body)
  }

  // 反应

  if (Buffer.isBuffer(body)) return res.end(body)
  if (typeof body === 'string') return res.end(body)
  if (body instanceof Stream) return body.pipe(res)
  if (body instanceof Blob) return Stream.Readable.from(body.stream()).pipe(res)
  if (body instanceof ReadableStream) return Stream.Readable.from(body).pipe(res)
  if (body instanceof Response) return Stream.Readable.from(body?.body).pipe(res)

  // body: json
  body = JSON.stringify(body)
  if (!res.headersSent) {
    ctx.length = Buffer.byteLength(body)
  }
  res.end(body)
}

/**
 * 使 HttpError 对库的使用者可用，以便使用者不会
 * 直接依赖于 'http-errors'
 */

module.exports.HttpError = HttpError
