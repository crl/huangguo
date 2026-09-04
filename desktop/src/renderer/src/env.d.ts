/// <reference types="vite/client" />
import type { HuangguoAPI } from '../../shared/api'

declare global {
  interface Window {
    huangguo: HuangguoAPI
  }
}

export {}
