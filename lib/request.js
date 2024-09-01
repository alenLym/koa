'use strict'

/**
 * Module dependencies.
 */

const URL = require('url').URL
const net = require('net')
const accepts = require('accepts')
const contentType = require('content-type')
const stringify = require('url').format
const parse = require('parseurl')
const qs = require('querystring')
const typeis = require('type-is')
const fresh = require('fresh')
const only = require('./only.js')
const util = require('util')

const IP = Symbol('context#ip')

/**
 * Prototype.
 */

module.exports = {

  /**
   * Return request header.
   *
   * @return {Object}
   * @api public
   */

  get header () {
    return this.req.headers
  },

  /**
   * Set request header.
   *
   * @api public
   */

  set header (val) {
    this.req.headers = val
  },

  /**
   * Return request header, alias as request.header
   *
   * @return {Object}
   * @api public
   */

  get headers () {
    return this.req.headers
  },

  /**
   * Set request header, alias as request.header
   *
   * @api public
   */

  set headers (val) {
    this.req.headers = val
  },

  /**
   * Get request URL.
   *
   * @return {String}
   * @api public
   */

  get url () {
    return this.req.url
  },

  /**
   * Set request URL.
   *
   * @api public
   */

  set url (val) {
    this.req.url = val
  },

  /**
   * Get origin of URL.
   *
   * @return {String}
   * @api public
   */

  get origin () {
    return `${this.protocol}://${this.host}`
  },

  /**
   * Get full request URL.
   *
   * @return {String}
   * @api public
   */

  get href () {
    // support: `GET http://example.com/foo`
    if (/^https?:\/\//i.test(this.originalUrl)) return this.originalUrl
    return this.origin + this.originalUrl
  },

  /**
   * Get request method.
   *
   * @return {String}
   * @api public
   */

  get method () {
    return this.req.method
  },

  /**
   * Set request method.
   *
   * @param {String} val
   * @api public
   */

  set method (val) {
    this.req.method = val
  },

  /**
   * Get request pathname.
   *
   * @return {String}
   * @api public
   */

  get path () {
    return parse(this.req).pathname
  },

  /**
   * Set pathname, retaining the query string when present.
   *
   * @param {String} path
   * @api public
   */

  set path (path) {
    const url = parse(this.req)
    if (url.pathname === path) return

    url.pathname = path
    url.path = null

    this.url = stringify(url)
  },

  /**
   * Get parsed query string.
   *
   * @return {Object}
   * @api public
   */

  get query () {
    const str = this.querystring
    const c = this._querycache = this._querycache || {}
    return c[str] || (c[str] = qs.parse(str))
  },

  /**
   * Set query string as an object.
   *
   * @param {Object} obj
   * @api public
   */

  set query (obj) {
    this.querystring = qs.stringify(obj)
  },

  /**
   * Get query string.
   *
   * @return {String}
   * @api public
   */

  get querystring () {
    if (!this.req) return ''
    return parse(this.req).query || ''
  },

  /**
   * Set query string.
   *
   * @param {String} str
   * @api public
   */

  set querystring (str) {
    const url = parse(this.req)
    if (url.search === `?${str}`) return

    url.search = str
    url.path = null

    this.url = stringify(url)
  },

  /**
   * Get the search string. Same as the query string
   * except it includes the leading ?.
   *
   * @return {String}
   * @api public
   */

  get search () {
    if (!this.querystring) return ''
    return `?${this.querystring}`
  },

  /**
   * Set the search string. Same as
   * request.querystring= but included for ubiquity.
   *
   * @param {String} str
   * @api public
   */

  set search (str) {
    this.querystring = str
  },

  /**
   * Parse the "Host" header field host
   * and support X-Forwarded-Host when a
   * proxy is enabled.
   *
   * @return {String} hostname:port
   * @api public
   */

  get host () {
    const proxy = this.app.proxy
    let host = proxy && this.get('X-Forwarded-Host')
    if (!host) {
      if (this.req.httpVersionMajor >= 2) host = this.get(':authority')
      if (!host) host = this.get('Host')
    }
    if (!host) return ''
    return host.split(/\s*,\s*/, 1)[0]
  },

  /**
   * Parse the "Host" header field hostname
   * and support X-Forwarded-Host when a
   * proxy is enabled.
   *
   * @return {String} hostname
   * @api public
   */

  get hostname () {
    const host = this.host
    if (!host) return ''
    if (host[0] === '[') return this.URL.hostname || '' // IPv6
    return host.split(':', 1)[0]
  },

  /**
   * Get WHATWG parsed URL.
   * Lazily memoized.
   *
   * @return {URL|Object}
   * @api public
   */

  get URL () {
    /* istanbul ignore else */
    if (!this.memoizedURL) {
      const originalUrl = this.originalUrl || '' // avoid undefined in template string
      try {
        this.memoizedURL = new URL(`${this.origin}${originalUrl}`)
      } catch (err) {
        this.memoizedURL = Object.create(null)
      }
    }
    return this.memoizedURL
  },

  /**
   * Check if the request is fresh, aka
   * Last-Modified and/or the ETag
   * still match.
   *
   * @return {Boolean}
   * @api public
   */

  get fresh () {
    const method = this.method
    const s = this.ctx.status

    // GET or HEAD for weak freshness validation only
    if (method !== 'GET' && method !== 'HEAD') return false

    // 2xx or 304 as per rfc2616 14.26
    if ((s >= 200 && s < 300) || s === 304) {
      return fresh(this.header, this.response.header)
    }

    return false
  },

  /**
   * Check if the request is stale, aka
   * "Last-Modified" and / or the "ETag" for the
   * resource has changed.
   *
   * @return {Boolean}
   * @api public
   */

  get stale () {
    return !this.fresh
  },

  /**
   * Check if the request is idempotent.
   *
   * @return {Boolean}
   * @api public
   */

  get idempotent () {
    const methods = ['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS', 'TRACE']
    return !!~methods.indexOf(this.method)
  },

  /**
   * Return the request socket.
   *
   * @return {Connection}
   * @api public
   */

  get socket () {
    return this.req.socket
  },

  /**
   * Get the charset when present or undefined.
   *
   * @return {String}
   * @api public
   */

  get charset () {
    try {
      const { parameters } = contentType.parse(this.req)
      return parameters.charset || ''
    } catch (e) {
      return ''
    }
  },

  /**
   * Return parsed Content-Length when present.
   *
   * @return {Number|void}
   * @api public
   */

  get length () {
    const len = this.get('Content-Length')
    if (len === '') return
    return ~~len
  },

  /**
   * Return the protocol string "http" or "https"
   * when requested with TLS. When the proxy setting
   * is enabled the "X-Forwarded-Proto" header
   * field will be trusted. If you're running behind
   * a reverse proxy that supplies https for you this
   * may be enabled.
   *
   * @return {String}
   * @api public
   */

  get protocol () {
    if (this.socket.encrypted) return 'https'
    if (!this.app.proxy) return 'http'
    const proto = this.get('X-Forwarded-Proto')
    return proto ? proto.split(/\s*,\s*/, 1)[0] : 'http'
  },

  /**
   * Shorthand for:
   *
   *    this.protocol == 'https'
   *
   * @return {Boolean}
   * @api public
   */

  get secure () {
    return this.protocol === 'https'
  },

  /**
   * When `app.proxy` is `true`, parse
   * the "X-Forwarded-For" ip address list.
   *
   * For example if the value was "client, proxy1, proxy2"
   * you would receive the array `["client", "proxy1", "proxy2"]`
   * where "proxy2" is the furthest down-stream.
   *
   * @return {Array}
   * @api public
   */

  get ips () {
    const proxy = this.app.proxy
    const val = this.get(this.app.proxyIpHeader)
    let ips = proxy && val
      ? val.split(/\s*,\s*/)
      : []
    if (this.app.maxIpsCount > 0) {
      ips = ips.slice(-this.app.maxIpsCount)
    }
    return ips
  },

  /**
   * Return request's remote address
   * When `app.proxy` is `true`, parse
   * the "X-Forwarded-For" ip address list and return the first one
   *
   * @return {String}
   * @api public
   */

  get ip () {
    if (!this[IP]) {
      this[IP] = this.ips[0] || this.socket.remoteAddress || ''
    }
    return this[IP]
  },

  set ip (_ip) {
    this[IP] = _ip
  },

  /**
   * Return subdomains as an array.
   *
   * Subdomains are the dot-separated parts of the host before the main domain
   * of the app. By default, the domain of the app is assumed to be the last two
   * parts of the host. This can be changed by setting `app.subdomainOffset`.
   *
   * For example, if the domain is "tobi.ferrets.example.com":
   * If `app.subdomainOffset` is not set, this.subdomains is
   * `["ferrets", "tobi"]`.
   * If `app.subdomainOffset` is 3, this.subdomains is `["tobi"]`.
   *
   * @return {Array}
   * @api public
   */

  get subdomains () {
    const offset = this.app.subdomainOffset
    const hostname = this.hostname
    if (net.isIP(hostname)) return []
    return hostname
      .split('.')
      .reverse()
      .slice(offset)
  },

  /**
   * Get accept object.
   * Lazily memoized.
   *
   * @return {Object}
   * @api private
   */

  get accept () {
    return this._accept || (this._accept = accepts(this.req))
  },

  /**
   * Set accept object.
   *
   * @param {Object} obj
   * @api private
   */

  set accept (obj) {
    this._accept = obj
  },

  /**
   * 检查给定的 'type（s）' 是否可接受，返回
   * 当 true 时为最佳匹配，否则为 'false'，其中
   * 情况下，您应该回答 406 “不可接受”。
   *
   * 'type' 值可以是单个 MIME 类型字符串
   * 例如 “application/json”，扩展名
   * 例如 “json” 或数组 '[“json”， “html”， “text/plain”]'。当列表
   * or 数组被赋予 _best_ 匹配项（如果返回 any）。
   *
   * 例子：
   *
   *     接受： text/html
   *     this.accepts（'html'）;
   *     => “html”
   *
   *     接受：text/*， application/json
   *     this.accepts（'html'）;
   *     => “html”
   *     this.accepts（'文本/html'）;
   *     => “文本/html”
   *     this.accepts（'json'， '文本'）;
   *     => “json”
   *     this.accepts（'application/json'）;
   *     => “应用程序/json”
   *
   *     接受：text/*， application/json
   *     this.accepts（'image/png'）;
   *     this.accepts（'png'）;
   *     => 错
   *
   *     接受：text/*;q=.5，应用程序/json
   *     this.accepts（['html'， 'json']）;
   *     this.accepts（'html'， 'json'）;
   *     => “json”
   *
   * @param {string|Array} 类型...
   * @return {string|数组|false}
   * @api公众
   */

  accepts (...args) {
    return this.accept.types(...args)
  },

  /**
   * 返回接受的编码或基于 'encodings' 的最佳匹配。
   *
   * 给定 'Accept-Encoding： gzip， deflate'
   * 返回按 quality 排序的数组：
   *
   *     ['gzip'， '放气']
   *
   * @param {string|数组} 编码...
   * @return {string|数组}
   * @api公众
   */

  acceptsEncodings (...args) {
    return this.accept.encodings(...args)
  },

  /**
   * 返回接受的字符集或基于 'charsets' 的最佳拟合。
   *
   * 给定 'Accept-Charset： utf-8， iso-8859-1;q=0.2，utf-7;q=0.5'
   * 返回按 quality 排序的数组：
   *
   *     ['UTF-8'， 'UTF-7'， 'ISO-8859-1']
   *
   * @param {string|数组} 字符集...
   * @return {string|数组}
   * @api公众
   */

  acceptsCharsets (...args) {
    return this.accept.charsets(...args)
  },

  /**
   * 返回接受的语言或根据 'langs' 最适合的语言。
   *
   * 给定 'Accept-Language： en;q=0.8， es， pt'
   * 返回按 quality 排序的数组：
   *
   *     ['es'， 'pt'， 'en']
   *
   * @param {string|数组} lang（s）...
   * @return {array|字符串}
   * @api公众
   */

  acceptsLanguages (...args) {
    return this.accept.languages(...args)
  },

  /**
   * 检查传入请求是否包含 “Content-Type”
   * header 字段，如果它包含任何给定的 MIME 'type's。
   * 如果没有请求正文，则返回 null。
   * 如果没有内容类型，则返回 'false'。
   * 否则，它将返回匹配的第一个 'type'。
   *
   * 例子：
   *
   *     使用 Content-Type： text/html;字符集=UTF-8
   *     this.is（'html'）;=> 'html'
   *     this.is（'text/html'）;=> '文本/html'
   *     this.is（'text/*'， 'application/json'）;=> '文本/html'
   *
   *     当 Content-Type 为 application/json 时
   *     this.is（'json'， 'urlencoded'）;=> 'json'
   *     this.is（'application/json'）;=> 'application/json'
   *     this.is（'html'， 'application/*'）;=> 'application/json'
   *
   *     this.is（'html'）;=> 错
   *
   * @param {string|字符串 []} [类型]
   * @param {String[]} [类型]
   * @return {string|false|null}
   * @api公众
   */

  is (type, ...types) {
    return typeis(this.req, type, ...types)
  },

  /**
   * Return the request mime type void of
   * parameters such as "charset".
   *
   * @return {String}
   * @api public
   */

  get type () {
    const type = this.get('Content-Type')
    if (!type) return ''
    return type.split(';')[0]
  },

  /**
   * 返回请求标头。
   *
   * “Referrer”标头字段是特殊大小写的，
   * “Referrer”和“Referer”都可以互换。
   *
   * 例子：
   *
   *     this.get（'内容类型'）;
   *     => “文本/纯文本”
   *
   *     this.get（'内容类型'）;
   *     => “文本/纯文本”
   *
   *     this.get（'某物'）;
   *     // => ''
   *
   * @param {String} 字段
   * @return {字符串}
   * @api公众
   */

  get (field) {
    const req = this.req
    switch (field = field.toLowerCase()) {
      case 'referer':
      case 'referrer':
        return req.headers.referrer || req.headers.referer || ''
      default:
        return req.headers[field] || ''
    }
  },

  /**
   * Inspect implementation.
   *
   * @return {Object}
   * @api public
   */

  inspect () {
    if (!this.req) return
    return this.toJSON()
  },

  /**
   * Return JSON representation.
   *
   * @return {Object}
   * @api public
   */

  toJSON () {
    return only(this, [
      'method',
      'url',
      'header'
    ])
  }
}

/**
 * Custom inspection implementation for newer Node.js versions.
 *
 * @return {Object}
 * @api public
 */

/* istanbul ignore else */
if (util.inspect.custom) {
  module.exports[util.inspect.custom] = module.exports.inspect
}
