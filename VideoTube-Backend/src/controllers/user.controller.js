import { ApiError } from '../utils/ApiError.js';
import {asyncHandler} from '../utils/asyncHandler.js';
import { User} from '../models/user.modle.js';
import {uploadOnCloudinary} from '../utils/cloudinary.js'
import { ApiResponse } from '../utils/ApiResponse.js';
import jwt  from 'jsonwebtoken';


const generateAccessAndRefreshTokens = async (userId)=>{
    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken
        await user.save({validateBeforeSave : false})

        return {accessToken , refreshToken}
    } catch (error) {
        throw new ApiError(500,error?.message || "Something went wrong while genetating Access and Refresh token ")
    }
}


const registerUser = asyncHandler( async (req,res)=>{
   // ui design for registration
   // value aaygi us ko schema me dena hoga 
   // mongodb server se connect krna hoga 
    const {fullname,email,username,password} = req.body
    if (fullname === "") throw new ApiError(400,"fullname is required");
    if (email === "") throw new ApiError(400,"email is required");
    if (username === "") throw new ApiError(400,"username is required");
    if (password === "") throw new ApiError(400,"password is required");
    // console.log(req.body)
    
    const existedUser = await User.findOne({
        $or : [{username},{email}]
    })
    if(existedUser){
        throw new ApiError(409,"User is already exist with this username or email")
    }
    console.log(req.files);
    const avatarLocalPath = req.files?.avatar[0]?.path;
    // const coverImageLocalPath = req.files?.coverImage[0]?.path;
    let coverImageLocalPath;
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0){
        coverImageLocalPath = req.files.coverImage[0].path;
    }

    if(!avatarLocalPath) throw new ApiError(400,"Avatar file is required")
    
    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if(!avatar) throw new ApiError(400,"Avatar file is required")

    const user = await User.create({
        fullname,
        avatar : avatar.url,
        coverImage : coverImage?.url || "",
        email,
        password,
        username : username.toLowerCase()       
    })

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )
    if(!createdUser){
        throw new ApiError(500,"Something went wrong while registring the user!")
    }

    return res.status(201).json(
        new ApiResponse(200,createdUser,"User registered successfully")
    )
} )

const loginUser = asyncHandler(async (req, res)=>{
    // _____________TODO___________

    // sbse phele apan ko frontend se chaheye 2 fields username or password 
    // we have to check the username or email exist or not 
    // if username is right we must check that password is matches or not 
    // if not throw the error and give pop up for registration
    // if matches give then create the access and refresh token
    // send the refresh token to db
    //send the cookies
    
    const {email, username, password} =req.body
    if (!(username || email)) {
        throw new ApiError(400,"username or email is required!") 
    }
    const user = await User.findOne({
        $or : [{username},{email}]
    })
    if (!user) {
        throw new ApiError(404,"User does not exist!")
    }

    const isPasswordValid = await user.isPasswordCorrect(password)

    if (!isPasswordValid) {
        throw new ApiError(401,"Password is incorrect!")
    }

    const {accessToken , refreshToken} = await generateAccessAndRefreshTokens(user._id)

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

    const options = {
        httpOnly : true,
        secure : true
    }

    return res
    .status(200)
    .cookie("accessToken",accessToken,options)
    .cookie("refreshToken",refreshToken,options)
    .json(
        new ApiResponse(
            200,
            {
                user : loggedInUser,accessToken,refreshToken
            },
            "user logged In Successfully"
        )
    )
})

const logoutUser = asyncHandler(async (req,res)=>{
    // const oneuser = await User.findOne(username)
    // console.log(oneuser);
    await User.findByIdAndUpdate(
        // console.log(req.user);
        req.user._id,
        {
            $set : {
                refreshToken : undefined
            }
        },
        {new : true}
    )

    const options = {
        httpOnly : true,
        secure : true
    }
    return res
    .status(200)
    .clearCookie("accessToken",options)
    .clearCookie("refreshToken",options)
    .json(new ApiResponse(200,{},"User logged Out"))
})

const refreshAccessToken = asyncHandler(async(req,res)=>{
    const incommingRefreshToken = req.cookies.refreshToken || req.body.refreshToken
    if (!incommingRefreshToken) {
        throw new ApiError(401 , "unauthorized request")
    }

    try {
        
        const decodedToken = jwt.verify(refreshAccessToken,process.env.REFRESH_TOKEN_SECRET)
        const user = await User.findById(decodedToken._id)
        if (!user) {
            throw new ApiError(401 , "Invalid refresh token")
        }
        if (incommingRefreshToken !== user?.refreshToken) {
            throw new ApiError(401,"Refresh token is either expired or used!")
        }
    
        const options = {
            httpOnly : true,
            secure : true
        }
        const {accessToken, newRefreshToken } = await generateAccessAndRefreshTokens(user_is)
    
        return res
        .status()
        .cookie("accessToken",accessToken, options)
        .cookie("refreshToken", newRefreshToken,options)
        .json(
            new ApiResponse(
                200,
                {accessToken, refreshtoken:newRefreshToken},
                'Access token refreshed'
            )
        )
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token")
        
    }
})

const changeCurrentPassword = asyncHandler(async(req,res)=>{
    const {oldPassword,newPassword} = req.body
    const user = await User.findById(req.user._id)
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

    if (!isPasswordCorrect) {
        throw new ApiError(400, "invalid old password")
    }
    user.password = newPassword
    await user.save({validateBeforeSave:false})
    return res
    .status(200)
    .json(new ApiResponse(200,{},"Password changed successfully"))
})

const getCurrentUser = asyncHandler(async(req,res)=>{
    return res
    .status(200)
    .json(200,req.user,"current user fetched successfully")
})

const updateAccountDetails = asyncHandler(async(req,res)=>{
    const {fullname,email} = req.body
    if (!fullname) throw new ApiError(400,"Full Name is required")
    if (!email) throw new ApiError(400,"Email is required")

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                fullname : fullname,
                email : email
            }
        },
        {new : true}
    ).select("-password")
    return res
    .status(200)
    .json(new ApiResponse(200,user,"Account details updated successfully"))
    

})


const updateUserAvatar = asyncHandler(async(req,res)=>{
    const avatarLocalPath = req.file?.path

    if (!avatarLocalPath) {
        throw new ApiError(400,"avatar file is missing")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)

    if(!avatar.url){
        throw new ApiError(400,"Error when uploading the avatar in cloudinary")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                avatar: avatar.url
            }
        },
        {new : true}
    ).select("-password")

    return res
    .status(200)
    .json(new ApiResponse(200,user,"The user avatar is updated successfully"))
})
const updateUserCoverImage = asyncHandler(async(req,res)=>{
    const coverImageLocalPath = req.file?.path

    if (!coverImageLocalPath) {
        throw new ApiError(400,"coverImage file is missing")
    }

    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if(!coverImage.url){
        throw new ApiError(400,"Error when uploading the coverImage in cloudinary")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                coverImage: coverImage.url
            }
        },
        {new : true}
    ).select("-password")

    return res
    .status(200)
    .json(new ApiResponse(200,user,"The user's Cover Image is updated successfully"))
})

const getUserChannelProfile = asyncHandler(async (req,res)=>{
    const {username} = req.prams
    if(!username?.trim()){
        throw new ApiError(400,"user is missing")
    } 
    const channel = await User.aggregate([    // channel will return a array
        {
            $match : {
                username : username?.toLowerCase()
            },    
        },
        {
            $lookup: {
                from : "subscriptions",
                localField : "_id",
                foreignField : "channel",
                as : "subscribers"
            },
            
        },
        {
            $lookup : {
                from : "subscriptions",
                localField : "_id",
                foreignField : "subscriber",
                as : "subscriberTo"
            }
        },
        {
            $addFields : {
                subscribersCount : {
                    $size : "$subscribers"
                },
                channelSubscribedToCount : {
                    $size : "$subscriberTo"
                },
                
                isSubscribed : {
                        $cond : {
                            if : {$in : [req.user?._id,"$subscribers.subscriber"]},
                            then: true,
                            else : false
                        }
                }
            }
        },
        {
            $project : {
                fullname : 1,
                username : 1,
                email : 1, 
                subscribersCount : 1,
                channelSubscribedToCount : 1,
                isSubscribed : 1,
                avatar : 1,
                coverImage : 1,
                createdAt : 1,
            }
        }
    ])
    if (!channel) {
        throw new ApiError(404,"Channel does not exist!")
    }
    return res.
    status(200)
    .json(
        new ApiResponse(200,channel[0],"User channel fetched successfully")
    )
})

const getWatchHistory = asyncHandler(async (req,res) =>{
    const user = User.aggregate([
        {
            $match : {
                _id : new mongoose.Types.ObjectId(req.user._id)
            },    
        },
        {
            $lookup : {
                from : "videos",
                localField : "watchHistory",
                foreignField : "_id",
                as : "watchHistory",
                pipeline : [
                    {
                        $lookup : {
                            from: "users",
                            localField : "owner",
                            foreignField : "_id",
                            as : "owner",
                            pipeline : [
                                {
                                    $project : {
                                        fullname : 1,
                                        username : 1,
                                        avatar : 1
                                    }
                                }
                            ]
                        },   
                    },
                    {
                        $addFields : {
                            owner : {
                                $first : "$owner"
                            }
                        }
                    }
                ]
            }
        }
    ])
    return res.
    status(200)
    .json(new ApiResponse(
        200,
        user[0].WatchHistory,
        "watch history featched successfully"
    ))
})

export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile,
    getWatchHistory
}