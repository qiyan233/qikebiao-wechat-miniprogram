const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

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

  return rawMessage || '调用微信订阅消息接口失败'
}

const DEFAULT_TIME_SLOTS = [

  { id: 1, start: '08:00', end: '08:45' },
  { id: 2, start: '08:55', end: '09:40' },
  { id: 3, start: '10:05', end: '10:50' },
  { id: 4, start: '11:00', end: '11:45' },
  { id: 5, start: '14:30', end: '15:15' },
  { id: 6, start: '15:25', end: '16:10' },
  { id: 7, start: '16:35', end: '17:20' },
  { id: 8, start: '17:30', end: '18:15' },
  { id: 9, start: '19:30', end: '20:15' },
  { id: 10, start: '20:25', end: '21:10' },
  { id: 11, start: '21:20', end: '22:05' },
  { id: 12, start: '22:15', end: '23:00' }
]

exports.main = async (event = {}) => {
  try {
    if (event.action === 'test') {
      return await sendTestReminder(event)
    }

    return await runReminderScan(event)
  } catch (error) {
    console.error('sendClassReminder failed', error)
    return {
      success: false,
      error: error.message
    }
  }
}

async function runReminderScan(event = {}) {
  const [settingsRes, schedulesRes] = await Promise.all([
    db.collection('user_settings').get(),
    db.collection('schedules').get()
  ])

  const now = event.mockNow ? new Date(event.mockNow) : new Date()
  const dryRun = !!event.dryRun
  const triggered = []
  const skipped = []

  for (const settings of settingsRes.data || []) {
    if (!settings.subscribeMessageEnabled || !settings.classReminderEnabled || !settings.subscribeTemplateId) {
      skipped.push({ openid: settings._openid, reason: 'reminder_disabled_or_template_missing' })
      continue
    }

    const reminderMinutes = Number(settings.reminderMinutes || 10)
    const semesterStartDate = settings.semesterStartDate
    const timeSlots = settings.timeSlots || DEFAULT_TIME_SLOTS
    const schedule = (schedulesRes.data || []).find(item => item._openid === settings._openid)
    const courses = schedule?.courses || []

    if (!semesterStartDate || !courses.length) {
      skipped.push({ openid: settings._openid, reason: 'missing_settings_or_courses' })
      continue
    }

    const currentWeek = calculateCurrentWeek(semesterStartDate, now)
    let currentDay = now.getDay()
    if (currentDay === 0) currentDay = 7

    const todayCourses = courses
      .filter(course => course.day === currentDay && Array.isArray(course.weeks) && course.weeks.includes(currentWeek))
      .sort((a, b) => a.start - b.start)

    if (!todayCourses.length) {
      skipped.push({ openid: settings._openid, reason: 'no_course_for_current_time' })
      continue
    }

    for (const course of todayCourses) {
      const slot = timeSlots[course.start - 1]
      if (!slot?.start) {
        skipped.push({ openid: settings._openid, reason: 'missing_time_slot', course: course.name })
        continue
      }

      const reminderTime = getReminderTime(now, slot.start, reminderMinutes)
      const diffMinutes = Math.floor((now.getTime() - reminderTime.getTime()) / 60000)
      if (diffMinutes < 0 || diffMinutes > 0) {
        skipped.push({ openid: settings._openid, reason: 'not_in_trigger_window', course: course.name })
        continue
      }

      const reminderId = buildReminderId(now, currentWeek, course, reminderMinutes)
      if (settings.lastReminderId === reminderId) {
        skipped.push({ openid: settings._openid, reason: 'already_triggered', course: course.name })
        continue
      }

      const classTime = formatCourseTime(now, slot.start)
      const page = settings.subscribePage || 'pages/schedule/schedule'
      const data = normalizeSubscribeData(buildSubscribeData(settings.subscribeData, {
        courseName: course.name,
        classTime,
        location: course.location || '未安排',
        remark: `第${currentWeek}周 · 提前 ${reminderMinutes} 分钟提醒`
      }))

      if (!dryRun) {
        await cloud.openapi.subscribeMessage.send({
          touser: settings._openid,
          templateId: settings.subscribeTemplateId,
          page,
          data,
          miniprogramState: 'formal',
          lang: 'zh_CN'
        })

        await db.collection('user_settings').doc(settings._id).update({
          data: {
            lastReminderId: reminderId,
            lastReminderTime: db.serverDate(),
            updateTime: db.serverDate()
          }
        })
      }

      triggered.push({
        openid: settings._openid,
        course: course.name,
        reminderId,
        classTime,
        dryRun
      })
    }
  }

  return {
    success: true,
    dryRun,
    scanTime: formatFullTime(now),
    triggeredCount: triggered.length,
    triggered,
    skipped
  }
}

async function sendTestReminder(event = {}) {
  const wxContext = cloud.getWXContext()
  const settingsRes = await db.collection('user_settings').where({
    _openid: wxContext.OPENID
  }).get()
  const settings = settingsRes.data?.[0]

  if (!settings?.subscribeTemplateId) {
    return {
      success: false,
      error: '请先在我的页面填写订阅消息模板 ID'
    }
  }

  const reminderMinutes = Number(event.reminderMinutes || settings.reminderMinutes || 10)
  const now = new Date()
  const data = normalizeSubscribeData(buildSubscribeData(settings.subscribeData, {
    courseName: '高等数学',
    classTime: formatCourseTime(now, '08:00'),
    location: '教学楼 A-101',
    remark: `提前 ${reminderMinutes} 分钟提醒`
  }))

  await cloud.openapi.subscribeMessage.send({
    touser: wxContext.OPENID,
    templateId: settings.subscribeTemplateId,
    page: settings.subscribePage || 'pages/schedule/schedule',
    data,
    miniprogramState: 'formal',
    lang: 'zh_CN'
  })

  return {
    success: true,
    message: '测试订阅消息已发送'
  }
}

function buildSubscribeData(savedTemplate = {}, payload = {}) {
  const baseData = savedTemplate && typeof savedTemplate === 'object' ? { ...savedTemplate } : {}
  const merged = { ...baseData }
  const keys = Object.keys(baseData)

  const fallbackMap = [
    payload.courseName,
    payload.classTime,
    payload.location,
    payload.remark
  ]

  if (keys.length) {
    keys.forEach((key, index) => {
      const source = baseData[key]
      const fallbackValue = fallbackMap[index] || payload.remark || ''
      merged[key] = source && typeof source === 'object' && 'value' in source
        ? { ...source, value: source.value || fallbackValue }
        : (source || fallbackValue)
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

function normalizeSubscribeData(templateData = {}) {
  const result = {}
  Object.keys(templateData).forEach(key => {
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
  const [hours, minutes] = startTime.split(':').map(Number)
  const reminderDate = new Date(now)
  reminderDate.setHours(hours, minutes, 0, 0)
  reminderDate.setMinutes(reminderDate.getMinutes() - reminderMinutes)
  return reminderDate
}

function getReminderTimeFromText(now, timeText) {
  const [hours, minutes] = String(timeText).split(':').map(Number)
  const reminderDate = new Date(now)
  reminderDate.setHours(hours, minutes, 0, 0)
  return reminderDate
}


function buildReminderId(now, currentWeek, course, reminderMinutes) {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const date = String(now.getDate()).padStart(2, '0')
  return `${year}${month}${date}_${currentWeek}_${course.id || `${course.name}_${course.day}_${course.start}`}_${reminderMinutes}`
}

function formatCourseTime(date, startTime) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day} ${startTime}`
}

function formatFullTime(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

