// Functions that call each endpoint. Pass the generated path and statuses (s200 etc.) to c.xxx
//   c.post(path, body, success status, ...error statuses)
//   The result is the union of the statuses passed (narrow it with status). 2xx is data, everything else is error
// `delete` is a reserved word in TS, so call it as c.delete() instead of a named import
import { c } from '@comatype/typescript'
import post_user from '@/comatype/post_user'
import get_user from '@/comatype/get_user'
import options_user from '@/comatype/options_user'
import query_user from '@/comatype/query_user'
import user_get from '@/comatype/user/get'
import user_get_me from '@/comatype/user/get_me'
import user_get_ping from '@/comatype/user/get_ping'
import user_put__id from '@/comatype/user/put__id'
import user_delete__id from '@/comatype/user/delete__id'
import user_post_login from '@/comatype/user/post_login'
import user_profile_get from '@/comatype/user/profile/get'

/** Sign up (POST /user). The body is Body (no uid) */
export const postUser = (input: post_user.Body) => c.post(post_user.path, input, post_user.s200).then((res) => res.data)

/** GET /user/:id (a sample with an explicit path). It has params and search, so pass a Request */
export const getUser = (id: string, verbose?: boolean) =>
  c.get(get_user.path, { params: { id }, search: { verbose } }, get_user.s200, get_user.s404)

// #region put-user
/** PUT /user/:id */
export const putUser = (id: string, user: user_put__id.Body) =>
  c.put(user_put__id.path, { params: { id }, body: user }, user_put__id.s200, user_put__id.s404)
// #endregion put-user

/** DELETE /user/:id */
export const deleteUser = (id: string) =>
  c.delete(user_delete__id.path, { params: { id } }, user_delete__id.s204, user_delete__id.s404)

/** GET /user?limit= */
export const listUsers = (limit?: number) => c.get(user_get.path, { search: { limit } }, user_get.s200)

/** QUERY /user: send the search criteria in the body */
export const queryUsers = (condition: query_user.Body) => c.query(query_user.path, condition, query_user.s200)

/** OPTIONS /user: there are no params / search / body, so no request argument is needed */
export const optionsUser = () => c.options(options_user.path, options_user.s200)

/** POST /user/login. On success the server issues a Set-Cookie */
export const login = (input: user_post_login.Body) =>
  c.post(user_post_login.path, input, user_post_login.s200, user_post_login.s401)

/** GET /user/profile (wrap auth is on, so 401 without login) */
export const getProfile = () => c.get(user_profile_get.path, user_profile_get.s200, user_profile_get.s401)

/** GET /user/me (`path ./me`) */
export const getMe = () => c.get(user_get_me.path, user_get_me.s200, user_get_me.s401)

/** GET /ping (a fixed path. wrap auth off) */
export const ping = () => c.get(user_get_ping.path, user_get_ping.s200)

/** Logout: drop the cookie jar and the cache (responses with `cache`). The cache key does not include Authorization, so always call this when the user changes */
export const logout = () => c.clearCache()
