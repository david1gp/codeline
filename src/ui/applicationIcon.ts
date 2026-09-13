import { mdiAccountCircleOutline } from "@adaptive-ds/mdi/mdiAccountCircleOutline.js"
import { mdiAlertCircleOutline } from "@adaptive-ds/mdi/mdiAlertCircleOutline.js"
import { mdiApi } from "@adaptive-ds/mdi/mdiApi.js"
import { mdiApplicationOutline } from "@adaptive-ds/mdi/mdiApplicationOutline.js"
import { mdiBrightnessAuto } from "@adaptive-ds/mdi/mdiBrightnessAuto.js"
import { mdiCheckCircleOutline } from "@adaptive-ds/mdi/mdiCheckCircleOutline.js"
import { mdiClose } from "@adaptive-ds/mdi/mdiClose.js"
import { mdiCloudOffOutline } from "@adaptive-ds/mdi/mdiCloudOffOutline.js"
import { mdiCodeBracesBox } from "@adaptive-ds/mdi/mdiCodeBracesBox.js"
import { mdiCogOutline } from "@adaptive-ds/mdi/mdiCogOutline.js"
import { mdiDatabaseSyncOutline } from "@adaptive-ds/mdi/mdiDatabaseSyncOutline.js"
import { mdiDockRight } from "@adaptive-ds/mdi/mdiDockRight.js"
import { mdiDotsHorizontal } from "@adaptive-ds/mdi/mdiDotsHorizontal.js"
import { mdiDotsHorizontalCircleOutline } from "@adaptive-ds/mdi/mdiDotsHorizontalCircleOutline.js"
import { mdiDownloadOutline } from "@adaptive-ds/mdi/mdiDownloadOutline.js"
import { mdiFolderMultipleOutline } from "@adaptive-ds/mdi/mdiFolderMultipleOutline.js"
import { mdiFolderOpenOutline } from "@adaptive-ds/mdi/mdiFolderOpenOutline.js"
import { mdiFolderOutline } from "@adaptive-ds/mdi/mdiFolderOutline.js"
import { mdiFolderPlusOutline } from "@adaptive-ds/mdi/mdiFolderPlusOutline.js"
import { mdiFormatListBulleted } from "@adaptive-ds/mdi/mdiFormatListBulleted.js"
import { mdiHistory } from "@adaptive-ds/mdi/mdiHistory.js"
import { mdiLanDisconnect } from "@adaptive-ds/mdi/mdiLanDisconnect.js"
import { mdiLoading } from "@adaptive-ds/mdi/mdiLoading.js"
import { mdiLogout } from "@adaptive-ds/mdi/mdiLogout.js"
import { mdiMagnify } from "@adaptive-ds/mdi/mdiMagnify.js"
import { mdiMessageTextOutline } from "@adaptive-ds/mdi/mdiMessageTextOutline.js"
import { mdiNoteTextOutline } from "@adaptive-ds/mdi/mdiNoteTextOutline.js"
import { mdiPinOffOutline } from "@adaptive-ds/mdi/mdiPinOffOutline.js"
import { mdiPinOutline } from "@adaptive-ds/mdi/mdiPinOutline.js"
import { mdiPlus } from "@adaptive-ds/mdi/mdiPlus.js"
import { mdiServerOff } from "@adaptive-ds/mdi/mdiServerOff.js"
import { mdiSync } from "@adaptive-ds/mdi/mdiSync.js"
import { mdiTextBoxOutline } from "@adaptive-ds/mdi/mdiTextBoxOutline.js"
import { mdiTrashCanOutline } from "@adaptive-ds/mdi/mdiTrashCanOutline.js"
import { mdiUpdate } from "@adaptive-ds/mdi/mdiUpdate.js"
import { mdiWeatherNight } from "@adaptive-ds/mdi/mdiWeatherNight.js"
import { mdiWhiteBalanceSunny } from "@adaptive-ds/mdi/mdiWhiteBalanceSunny.js"

export const applicationIcon = {
  account: mdiAccountCircleOutline,
  application: mdiApplicationOutline,
  connectionApi: mdiApi,
  connectionApiChecking: mdiDotsHorizontalCircleOutline,
  connectionAppOffline: mdiCloudOffOutline,
  connectionAppUpdate: mdiUpdate,
  connectionDatabase: mdiDatabaseSyncOutline,
  connectionError: mdiAlertCircleOutline,
  connectionNetworkOffline: mdiLanDisconnect,
  connectionOk: mdiCheckCircleOutline,
  connectionServerUnavailable: mdiServerOff,
  connectionSyncing: mdiSync,
  conversationView: mdiMessageTextOutline,
  close: mdiClose,
  delete: mdiTrashCanOutline,
  download: mdiDownloadOutline,
  folder: mdiFolderOutline,
  folderCreate: mdiFolderPlusOutline,
  folderGroup: mdiFolderMultipleOutline,
  folderOpen: mdiFolderOpenOutline,
  history: mdiHistory,
  loading: mdiLoading,
  more: mdiDotsHorizontal,
  projectCreate: mdiCodeBracesBox,
  promptContext: mdiTextBoxOutline,
  search: mdiMagnify,
  sessionCreate: mdiPlus,
  signOut: mdiLogout,
  streamView: mdiFormatListBulleted,
  settings: mdiCogOutline,
  rightPanel: mdiDockRight,
  update: mdiUpdate,
  pin: mdiPinOutline,
  pinOff: mdiPinOffOutline,
  themeAuto: mdiBrightnessAuto,
  themeDark: mdiWeatherNight,
  themeLight: mdiWhiteBalanceSunny,
  note: mdiNoteTextOutline,
} as const
