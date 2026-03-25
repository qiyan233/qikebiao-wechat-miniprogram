// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

function normalizeSubscribeData(templateData = {}) {
  const result = {}
  Object.keys(templateData || {}).forEach(key => {
    const item = templateData[key]
    if (item === undefined || item === null || item === '') return

    if (typeof item === 'object' && item !== null && 'value' in item) {
      result[key] = {
        value: String(item.value || '')
      }
      return
    }

    result[key] = {
      value: String(item)
    }
  })
  return result
}

function buildSubscribeData(savedTemplate = {}, payload = {}) {
  const baseData = savedTemplate && typeof savedTemplate === 'object' ? { ...savedTemplate } : {}
  const merged = { ...baseData }
  const keys = Object.keys(baseData)

  if (keys.length) {
    keys.forEach(key => {
      const source = baseData[key]
      const lowerKey = String(key).toLowerCase()
      const sourceValue = source && typeof source === 'object' && 'value' in source
        ? String(source.value || '')
        : String(source || '')

      let mappedValue = ''
      if (lowerKey === 'thing27') {
        mappedValue = payload.courseName || ''
      } else if (lowerKey === 'thing10') {
        mappedValue = payload.location || ''
      } else if (lowerKey === 'thing2') {
        mappedValue = payload.remark || ''
      } else if (lowerKey.startsWith('date') || lowerKey.startsWith('time')) {
        mappedValue = payload.classTime || ''
      } else if (/教室|楼|馆|室/.test(sourceValue)) {
        mappedValue = payload.location || ''
      } else if (/提醒|提前|上课/.test(sourceValue)) {
        mappedValue = payload.remark || ''
      } else if (/^\d{4}-\d{2}-\d{2}/.test(sourceValue) || /^\d{2}:\d{2}/.test(sourceValue)) {
        mappedValue = payload.classTime || ''
      } else {
        mappedValue = payload.courseName || ''
      }

      merged[key] = source && typeof source === 'object' && 'value' in source
        ? { ...source, value: mappedValue || sourceValue || '' }
        : (mappedValue || sourceValue || '')
    })
    return merged
  }

  return {
    thing2: payload.remark,
    date4: payload.classTime,
    thing10: payload.location,
    thing27: payload.courseName
  }
}

async function getCurrentUserConfig() {
  const wxContext = cloud.getWXContext()
  const [settingsRes] = await Promise.all([
    db.collection('user_settings').where({
      _openid: wxContext.OPENID
    }).get()
  ])

  return {
    wxContext,
    settings: settingsRes.data?.[0] || {}
  }
}

function mapOpenApiError(error) {
  const rawMessage = String(error?.message || error?.errMsg || '')

  if (rawMessage.includes('-604101')) {
    return '云函数暂无订阅消息接口权限，请在云开发控制台为当前环境开通“小程序消息推送”或对应 OpenAPI 权限后再重试'
  }

  if (rawMessage.includes('43101')) {
    return '用户已拒绝或未订阅该消息模板，请重新授权后再试'
  }

  if (rawMessage.includes('47003')) {
    return '订阅消息模板参数不正确，请检查模板字段名与字段内容格式'
  }

  if (rawMessage.includes('40037')) {
    return '订阅消息模板 ID 无效，请检查模板 ID 是否填写正确'
  }

  return rawMessage || '调用微信接口失败'
}

async function sendSubscribeMessage(event = {}) {
  const { wxContext, settings } = await getCurrentUserConfig()
  const templateId = event.templateId || settings.subscribeTemplateId
  const page = event.page || settings.subscribePage || 'pages/schedule/schedule'
  const data = normalizeSubscribeData(event.data || settings.subscribeData || {})
  const miniprogramState = event.miniprogramState || 'formal'
  const lang = event.lang || 'zh_CN'

  if (!templateId) {
    throw new Error('请先在“我的”页面填写订阅消息模板 ID')
  }

  if (!Object.keys(data).length) {
    throw new Error('请先配置订阅消息字段内容')
  }

  try {
    const result = await cloud.openapi.subscribeMessage.send({
      touser: wxContext.OPENID,
      templateId,
      page,
      data,
      miniprogramState,
      lang
    })

    return {
      success: true,
      templateId,
      page,
      data,
      result
    }
  } catch (error) {
    throw new Error(mapOpenApiError(error))
  }
}

async function sendCourseReminderSubscribeMessage(event = {}) {
  const { settings } = await getCurrentUserConfig()
  const reminderMinutes = Number(event.reminderMinutes || settings.reminderMinutes || 10)
  const templateData = buildSubscribeData(settings.subscribeData, {
    courseName: event.courseName || '高等数学',
    classTime: event.classTime || '2026-03-25 08:00:00',
    location: event.location || '教学楼 A-101',
    remark: event.remark || `提前 ${reminderMinutes} 分钟提醒`
  })

  return sendSubscribeMessage({
    templateId: event.templateId,
    page: event.page,
    data: templateData,
    miniprogramState: event.miniprogramState,
    lang: event.lang
  })
}

async function sendMatchedCourseReminder(event = {}) {
  const { wxContext, settings } = await getCurrentUserConfig()
  const mockNow = event.mockNow ? new Date(event.mockNow) : new Date()
  const reminderMinutes = Number(event.reminderMinutes || settings.reminderMinutes || 10)
  const semesterStartDate = settings.semesterStartDate
  const timeSlots = settings.timeSlots || DEFAULT_TIME_SLOTS

  if (!semesterStartDate) {
    throw new Error('请先设置开学日期')
  }

  const scheduleRes = await db.collection('schedules').where({
    _openid: wxContext.OPENID
  }).get()
  const schedule = scheduleRes.data?.[0] || {}
  const courses = schedule.courses || []

  if (!courses.length) {
    throw new Error('请先导入课程表')
  }

  const currentWeek = calculateCurrentWeek(semesterStartDate, mockNow)
  let currentDay = mockNow.getDay()
  if (currentDay === 0) currentDay = 7

  const matchedCourse = courses
    .filter(course => course.day === currentDay && Array.isArray(course.weeks) && course.weeks.includes(currentWeek))
    .sort((a, b) => a.start - b.start)
    .find(course => {
      const slot = timeSlots[course.start - 1]
      if (!slot?.start) return false
      const reminderTime = getReminderTime(mockNow, slot.start, reminderMinutes)
      return Math.floor((mockNow.getTime() - reminderTime.getTime()) / 60000) === 0
    })

  if (!matchedCourse) {
    throw new Error('当前测试时间没有匹配到应提醒的课程，请先点“立即扫描提醒”确认命中课程')
  }

  const slot = timeSlots[matchedCourse.start - 1]
  return sendCourseReminderSubscribeMessage({
    templateId: event.templateId,
    page: event.page,
    miniprogramState: event.miniprogramState,
    lang: event.lang,
    reminderMinutes,
    courseName: matchedCourse.name,
    classTime: formatCourseTime(mockNow, slot.start),
    location: matchedCourse.location || '未安排',
    remark: `第${currentWeek}周 · 提前 ${reminderMinutes} 分钟提醒`
  })
}

async function getWXACode() {
  const { result } = await cloud.openapi.wxacode.getUnlimited({
    scene: 'x=1'
  })

  return `data:${result.contentType};base64,${result.buffer.toString('base64')}`
}

function calculateCurrentWeek(startDate, now = new Date()) {
  const startObj = new Date(startDate)
  const startDayOfWeek = startObj.getDay() || 7
  startObj.setDate(startObj.getDate() - (startDayOfWeek - 1))
  startObj.setHours(0, 0, 0, 0)

  const current = new Date(now)
  current.setHours(0, 0, 0, 0)

  const diffDays = Math.floor((current.getTime() - startObj.getTime()) / (1000 * 60 * 60 * 24))
  return Math.max(1, Math.floor(diffDays / 7) + 1)
}

function getReminderTime(now, startTime, reminderMinutes) {
  const [hours, minutes] = String(startTime).split(':').map(Number)
  const reminderDate = new Date(now)
  reminderDate.setHours(hours, minutes, 0, 0)
  reminderDate.setMinutes(reminderDate.getMinutes() - reminderMinutes)
  return reminderDate
}

function formatCourseTime(date, startTime) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day} ${startTime}:00`
}

exports.main = async (event = {}) => {
  try {
    switch (event.action) {
      case 'sendSubscribeMessage':
        return sendSubscribeMessage(event)
      case 'sendCourseReminderSubscribeMessage':
        return sendCourseReminderSubscribeMessage(event)
      case 'sendMatchedCourseReminder':
        return sendMatchedCourseReminder(event)
      case 'getWXACode':
        return getWXACode(event)
      default:
        return {
          success: false,
          error: 'unknown action'
        }
    }
  } catch (error) {
    console.error('openapi failed', error)
    return {
      success: false,
      error: error.message
    }
  }
}
