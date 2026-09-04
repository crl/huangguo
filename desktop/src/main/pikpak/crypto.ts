import { createHash } from 'node:crypto'

export type PikPakPlatform = 'android' | 'pc' | 'web'

export type PikPakClientProfile = {
  platform: PikPakPlatform
  clientID: string
  clientSecret: string
  clientVersion: string
  packageName: string
  sdkVersion: string
  algorithms: string[]
  staticUserAgent: string | null
}

export const androidProfile: PikPakClientProfile = {
  platform: 'android',
  clientID: 'YNxT9w7GMdWvEOKa',
  clientSecret: 'dbw2OtmVEeuUvIptb1Coyg',
  clientVersion: '1.53.2',
  packageName: 'com.pikcloud.pikpak',
  sdkVersion: '2.0.6.206003',
  algorithms: [
    'SOP04dGzk0TNO7t7t9ekDbAmx+eq0OI1ovEx',
    'nVBjhYiND4hZ2NCGyV5beamIr7k6ifAsAbl',
    'Ddjpt5B/Cit6EDq2a6cXgxY9lkEIOw4yC1GDF28KrA',
    'VVCogcmSNIVvgV6U+AochorydiSymi68YVNGiz',
    'u5ujk5sM62gpJOsB/1Gu/zsfgfZO',
    'dXYIiBOAHZgzSruaQ2Nhrqc2im',
    'z5jUTBSIpBN9g4qSJGlidNAutX6',
    'KJE2oveZ34du/g1tiimm'
  ],
  staticUserAgent: null
}

export const pcProfile: PikPakClientProfile = {
  platform: 'pc',
  clientID: 'YvtoWO6GNHiuCl7x',
  clientSecret: '1NIH5R1IEe2pAxZE3hv3uA',
  clientVersion: 'undefined',
  packageName: 'mypikpak.com',
  sdkVersion: '8.0.3',
  algorithms: [
    'KHBJ07an7ROXDoK7Db',
    'G6n399rSWkl7WcQmw5rpQInurc1DkLmLJqE',
    'JZD1A3M4x+jBFN62hkr7VDhkkZxb9g3rWqRZqFAAb',
    'fQnw/AmSlbbI91Ik15gpddGgyU7U',
    '/Dv9JdPYSj3sHiWjouR95NTQff',
    'yGx2zuTjbWENZqecNI+edrQgqmZKP',
    'ljrbSzdHLwbqcRn',
    'lSHAsqCkGDGxQqqwrVu',
    'TsWXI81fD1',
    'vk7hBjawK/rOSrSWajtbMk95nfgf3'
  ],
  staticUserAgent:
    'MainWindow Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) PikPak/2.6.11.4955 Chrome/100.0.4896.160 Electron/18.3.15 Safari/537.36'
}

export const webProfile: PikPakClientProfile = {
  platform: 'web',
  clientID: 'YUMx5nI8ZU8Ap8pm',
  clientSecret: 'dbw2OtmVEeuUvIptb1Coyg',
  clientVersion: '2.0.0',
  packageName: 'mypikpak.com',
  sdkVersion: '8.0.3',
  algorithms: [
    'C9qPpZLN8ucRTaTiUMWYS9cQvWOE',
    '+r6CQVxjzJV6LCV',
    'F',
    'pFJRC',
    '9WXYIDGrwTCz2OiVlgZa90qpECPD6olt',
    '/750aCr4lm/Sly/c',
    'RB+DT/gZCrbV',
    '',
    'CyLsf7hdkIRxRm215hl',
    '7xHvLi2tOYP0Y92b',
    'ZGTXXxu8E/MIWaEDB+Sm/',
    '1UI3',
    'E7fP5Pfijd+7K+t6Tg/NhuLq0eEUVChpJSkrKxpO',
    'ihtqpG6FMt65+Xk+tWUH2',
    'NhXXU9rg4XXdzo7u5o'
  ],
  staticUserAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36'
}

export const allProfiles = [androidProfile, pcProfile, webProfile]

export function md5Hex(value: string): string {
  return createHash('md5').update(value, 'utf8').digest('hex')
}

export function sha1Hex(value: string): string {
  return createHash('sha1').update(value, 'utf8').digest('hex')
}

export function captchaSign(
  profile: PikPakClientProfile,
  deviceID: string,
  timestamp: string
): string {
  let value = profile.clientID + profile.clientVersion + profile.packageName + deviceID + timestamp
  for (const salt of profile.algorithms) {
    value = md5Hex(value + salt)
  }
  return `1.${value}`
}

export function deviceSign(deviceID: string, packageName: string): string {
  const sha1 = sha1Hex(`${deviceID}${packageName}1appkey`)
  const md5 = md5Hex(sha1)
  return `div101.${deviceID}${md5}`
}

export function androidUserAgent(deviceID: string, profile: PikPakClientProfile): string {
  const sign = deviceSign(deviceID, profile.packageName)
  const millis = Date.now()
  return [
    `ANDROID-${profile.packageName}/${profile.clientVersion}`,
    'protocolVersion/200',
    'accesstype/',
    `clientid/${profile.clientID}`,
    `clientversion/${profile.clientVersion}`,
    'action_type/',
    'networktype/WIFI',
    'sessionid/',
    `deviceid/${deviceID}`,
    'providername/NONE',
    `devicesign/${sign}`,
    'refresh_token/',
    `sdkversion/${profile.sdkVersion}`,
    `datetime/${millis}`,
    'usrno/',
    `appname/android-${profile.packageName}`,
    'session_origin/',
    'grant_type/',
    'appid/',
    'clientip/',
    'devicename/Xiaomi_M2004j7ac',
    'osversion/13',
    'platformversion/10',
    'accessmode/',
    'devicemodel/M2004J7AC'
  ].join(' ')
}
