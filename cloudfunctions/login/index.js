// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  
  // 获取或创建用户
  const db = cloud.database()
  const usersCollection = db.collection('users')
  
  let user = await usersCollection.where({
    _openid: wxContext.OPENID
  }).get()
  
  const normalizedUserInfo = {
    nickName: event.userInfo?.nickName || '',
    avatarUrl: event.userInfo?.avatarUrl || '',
    gender: event.userInfo?.gender || 0,
    city: event.userInfo?.city || '',
    province: event.userInfo?.province || '',
    country: event.userInfo?.country || '',
    language: event.userInfo?.language || ''
  }

  if (user.data.length === 0) {
    // 创建新用户
    await usersCollection.add({
      data: {
        _openid: wxContext.OPENID,
        userInfo: normalizedUserInfo,
        nickName: normalizedUserInfo.nickName,
        avatarUrl: normalizedUserInfo.avatarUrl,
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    })
  } else {
    // 更新用户信息
    await usersCollection.doc(user.data[0]._id).update({
      data: {
        userInfo: normalizedUserInfo,
        nickName: normalizedUserInfo.nickName,
        avatarUrl: normalizedUserInfo.avatarUrl,
        updateTime: db.serverDate()
      }
    })
  }
  
  return {
    openid: wxContext.OPENID,
    success: true
  }
}
