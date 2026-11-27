// Data shapes. Everything lives as small JSON files in the private data repo:
//   config.json            categories
//   users.json             who may use the app, and their role
//   lists/<id>.json        one file per list (items inside)
//   push/subscriptions.json  notification plumbing

export type Role = 'admin' | 'locker' | 'editor' | 'viewer'

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  locker: 'Editor + lock',
  editor: 'Editor',
  viewer: 'View only',
}

export const ROLE_HELP: Record<Role, string> = {
  admin: 'Manages users and categories, and can do everything an editor with lock can.',
  locker: 'Adds, edits and buys items, and can lock or unlock a list.',
  editor: 'Adds, edits and buys items. Cannot lock a list.',
  viewer: 'Can only look.',
}

export interface User {
  id: string
  /** 6 characters at the start of this person's access key; identifies them. */
  code: string
  name: string
  role: Role
  createdAt: string
}
export interface UsersFile {
  schema: 1
  users: User[]
}

export interface Category {
  id: string
  name: string
  /** Hidden from the tabs but kept so old items and charts still make sense. */
  archived?: boolean
}
export interface ConfigFile {
  schema: 1
  categories: Category[]
}

export interface Item {
  id: string
  name: string
  category: string
  qty?: string
  /** Expected price while pending; the actual price once bought. */
  price?: number
  done: boolean
  /** Local date (YYYY-MM-DD) the item was bought. */
  boughtOn?: string
  addedBy: string
  addedAt: string
  doneBy?: string
}

export interface ShopList {
  id: string
  name: string
  createdAt: string
  createdBy: string
  locked: boolean
  lockedBy?: string
  items: Item[]
}

export interface PushSub {
  userId: string
  deviceId: string
  device: string
  endpoint: string
  keys: { p256dh: string; auth: string }
  createdAt: string
}
export interface SubsFile {
  schema: 1
  subscriptions: PushSub[]
}

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'ration', name: 'Ration' },
  { id: 'fruits', name: 'Fruits' },
  { id: 'vegetables', name: 'Vegetables' },
]
