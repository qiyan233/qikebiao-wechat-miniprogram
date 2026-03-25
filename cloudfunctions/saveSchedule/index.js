// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const db = cloud.database()
  
  const courses = decorateCourses(event.courses || [], event.timeSlots || DEFAULT_TIME_SLOTS, Number(event.reminderMinutes || 10))
  const replaceExisting = !!event.replaceExisting
  
  try {
    // 查找当前用户所有课表，自动收敛为单条记录
    const existingRes = await db.collection('schedules').where({
      _openid: wxContext.OPENID
    }).get()
    
    if (existingRes.data.length > 0) {
      const sortedSchedules = [...existingRes.data].sort((a, b) => {
        const aTime = new Date(a.updateTime || a.createTime || 0).getTime()
        const bTime = new Date(b.updateTime || b.createTime || 0).getTime()
        return bTime - aTime
      })
      const primarySchedule = sortedSchedules[0]
      const mergedExistingCourses = sortedSchedules.flatMap(item => item.courses || [])
      const nextCourses = replaceExisting
        ? courses
        : mergeCourses(mergedExistingCourses, courses)

      await db.collection('schedules').doc(primarySchedule._id).update({
        data: {
          courses: nextCourses,
          updateTime: db.serverDate()
        }
      })

      const duplicateIds = sortedSchedules.slice(1).map(item => item._id).filter(Boolean)
      await Promise.all(duplicateIds.map(id => db.collection('schedules').doc(id).remove()))
    } else {
      // 新增
      await db.collection('schedules').add({
        data: {
          _openid: wxContext.OPENID,
          courses,
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      })
    }
    
    return { success: true }
  } catch (err) {
    console.error(err)
    return { success: false, error: err.message }
  }
}

function decorateCourses(courses = [], timeSlots = DEFAULT_TIME_SLOTS, reminderMinutes = 10) {
  return courses.map(course => {
    const slot = timeSlots[Number(course.start) - 1] || {}
    const startTime = slot.start || ''
    const reminderTime = startTime ? subtractMinutes(startTime, reminderMinutes) : ''

    return {
      ...course,
      startTime,
      reminderMinutes,
      reminderTime,
      reminderLabel: reminderTime ? `课前 ${reminderMinutes} 分钟（${reminderTime}）` : ''
    }
  })
}

function subtractMinutes(timeText, minutes) {
  const [hours = 0, mins = 0] = String(timeText).split(':').map(Number)
  const totalMinutes = hours * 60 + mins - minutes
  const normalized = ((totalMinutes % 1440) + 1440) % 1440
  const resultHours = Math.floor(normalized / 60)
  const resultMinutes = normalized % 60
  return `${String(resultHours).padStart(2, '0')}:${String(resultMinutes).padStart(2, '0')}`
}

