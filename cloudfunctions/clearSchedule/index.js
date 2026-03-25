// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const db = cloud.database()
  
  try {
    // 删除用户的课表记录
    const res = await db.collection('schedules').where({
      _openid: wxContext.OPENID
    }).remove()
    
    return { success: true, removed: res.stats.removed }
  } catch (err) {
    console.error(err)
    return { success: false, error: err.message }
  }
}
