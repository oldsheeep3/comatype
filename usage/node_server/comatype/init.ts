// 自動生成: comatype generate が作ったファイルです。手で編集しないでください
import { t, defineStatus, type StatusFn, type ComatypeWrap, type CookieInit } from '@comatype/typescript'
import { UserData, ApiError } from './types'

export type AuthCtx = {
  user: UserData;
}

export type S401 = { status: 401; error: ApiError }
export const s401: StatusFn<S401, { error: ApiError; cookie?: CookieInit }> = defineStatus(401, t.lazy(() => ApiError), null)
export declare namespace s401 {
  type Res = ApiError
}

/** init に渡すラッパーの実装（init.comat の `wrapper` ごと） */
export type Wrappers = {
  auth: ComatypeWrap<AuthCtx>;
}

declare module '@comatype/typescript' {
  interface ComatypeRegistry {
    wrappers: Wrappers
    cookies: "session"
  }
}
