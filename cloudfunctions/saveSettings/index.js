// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const db = cloud.database()
  
  const {
    semesterStartDate,
    timeSlots,
    classReminderEnabled,
    reminderMinutes,
    lastReminderId,
    subscribeTemplateId,
    subscribePage,
    subscribeData,
    subscribeMessageEnabled,
    testScanTime
  } = event

  
  try {
    // 查找是否已有设置
    const existingRes = await db.collection('user_settings').where({
      _openid: wxContext.OPENID
    }).get()
    
    const updateData = {
      updateTime: db.serverDate()
    }
    
    if (semesterStartDate !== undefined) {
      updateData.semesterStartDate = semesterStartDate
    }
    if (timeSlots !== undefined) {
      updateData.timeSlots = timeSlots
    }
    if (classReminderEnabled !== undefined) {
      updateData.classReminderEnabled = classReminderEnabled
    }
    if (subscribeTemplateId !== undefined) {
      updateData.subscribeTemplateId = subscribeTemplateId
    }
    if (subscribePage !== undefined) {
      updateData.subscribePage = subscribePage
    }
    if (subscribeData !== undefined) {
      updateData.subscribeData = subscribeData
    }
    if (subscribeMessageEnabled !== undefined) {
      updateData.subscribeMessageEnabled = subscribeMessageEnabled
    }
    if (classReminderEnabled !== undefined) {

      updateData.classReminderEnabled = classReminderEnabled
    }
    if (reminderMinutes !== undefined) {
      updateData.reminderMinutes = reminderMinutes
    }
    if (lastReminderId !== undefined) {
      updateData.lastReminderId = lastReminderId
    }
    if (testScanTime !== undefined) {
      updateData.testScanTime = testScanTime
    }
    
    if (existingRes.data.length > 0) {
      // 更新
      await db.collection('user_settings').doc(existingRes.data[0]._id).update({
        data: updateData
      })
    } else {
      // 新增
      await db.collection('user_settings').add({
        data: {
          _openid: wxContext.OPENID,
          ...updateData,
          createTime: db.serverDate()
        }
      })
    }
    
    return { success: true }
  } catch (err) {
    console.error(err)
    return { success: false, error: err.message }
  }
}
