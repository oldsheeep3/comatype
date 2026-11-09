// 自動生成: comatype generate が作ったファイルです。手で編集しないでください
import { t, type Schema, type Email, type Phone, type Uuidv4 } from '@comatype/typescript'

export type UserData = {
  name: string;
  email: Email;
  phone: Phone;
  uid: Uuidv4;
}
export const UserData: Schema<UserData> = t.object({
  name: t.string(),
  email: t.email(),
  phone: t.phone(),
  uid: t.uuidv4(),
})

export type ApiError = {
  code: string;
  message: string;
}
export const ApiError: Schema<ApiError> = t.object({
  code: t.string(),
  message: t.string(),
})
