// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const db = cloud.database()
  
  try {
    const res = await db.collection('user_settings').where({
      _openid: wxContext.OPENID
    }).get()
    
    if (res.data.length > 0) {
      return res.data[0]
    }
    
    return {}
  } catch (err) {
    console.error(err)
    return {}
  }
}
