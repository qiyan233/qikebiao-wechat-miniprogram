// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const db = cloud.database()
  
  try {
    // 获取课表
    const scheduleRes = await db.collection('schedules').where({
      _openid: wxContext.OPENID
    }).get()
    
    // 获取设置
    const settingsRes = await db.collection('user_settings').where({
      _openid: wxContext.OPENID
    }).get()
    
    const schedules = scheduleRes.data || []
    const sortedSchedules = [...schedules].sort((a, b) => {
      const aTime = new Date(a.updateTime || a.createTime || 0).getTime()
      const bTime = new Date(b.updateTime || b.createTime || 0).getTime()
      return bTime - aTime
    })
    const schedule = sortedSchedules[0] || { courses: [] }
    const settings = settingsRes.data[0] || {}
    
    return {
      courses: schedule.courses || [],
      settings: {
        semesterStartDate: settings.semesterStartDate || '',
        timeSlots: settings.timeSlots || getDefaultTimeSlots()
      }
    }
  } catch (err) {
    console.error(err)
    return {
      courses: [],
      settings: {
        semesterStartDate: '',
        timeSlots: getDefaultTimeSlots(),
        classReminderEnabled: false,
        reminderMinutes: 10
      }

    }
  }
}

function getDefaultTimeSlots() {
  return [
    { id: 1, start: '08:00', end: '08:45' },
    { id: 2, start: '08:55', end: '09:40' },
    { id: 3, start: '10:00', end: '10:45' },
    { id: 4, start: '10:55', end: '11:40' },
    { id: 5, start: '14:00', end: '14:45' },
    { id: 6, start: '14:55', end: '15:40' },
    { id: 7, start: '16:00', end: '16:45' },
    { id: 8, start: '16:55', end: '17:40' },
    { id: 9, start: '19:00', end: '19:45' },
    { id: 10, start: '19:55', end: '20:40' },
    { id: 11, start: '20:50', end: '21:35' },
    { id: 12, start: '21:45', end: '22:30' }
  ]
}
