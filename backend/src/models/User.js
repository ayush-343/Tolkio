import mongoose from "mongoose";

import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema({
    fullName: {
        type: String,
        required: true,
    },
    username: {
        type: String,
        unique: true,
        sparse: true, // sparse allows multiple docs with no username
    },
    email: {
        type: String,
        unique: true,
    },
    password: {
        type: String,
        required: true,
        minlength: 6
    },
    bio: {
        type: String,
        default: "",
    },
    profilePic: {
        type: String,
        default: ""
    },
    nativeLanguage: {
        type: String,
        default: "",
    },
    nativeProficiency: {
        type: String,
        default: "",
    },
    learningLanguage: {
        type: String,
        default: "",
    },
    learningProficiency: {
        type: String,
        default: "",
    },
    nativeLanguages: {
        type: [{
            language: String,
            proficiency: String,
        }],
        default: []
    },
    learningLanguages: {
        type: [{
            language: String,
            proficiency: String,
        }],
        default: []
    },
    location: {
        type: String,
        default: ""
    },
    isOnboarded: {
        type: Boolean,
        default: false,
    },
    friends: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        }
    ]

}, {
    timestamps: true
    //CreatedAt, updatedAt
    //member since created
})

//pre hook
//HASH THE PASSWORD
//to hash the password before saving
// ayush@gmail.cmo. 12345=> #$^ih324de
userSchema.pre("save", async function (next) {
    if (this.nativeLanguages && this.nativeLanguages.length > 0) {
        this.nativeLanguage = this.nativeLanguages[0].language;
        this.nativeProficiency = this.nativeLanguages[0].proficiency || "N";
    } else if (this.nativeLanguage) {
        this.nativeLanguages = [{ language: this.nativeLanguage, proficiency: this.nativeProficiency || "N" }];
    }

    if (this.learningLanguages && this.learningLanguages.length > 0) {
        this.learningLanguage = this.learningLanguages[0].language;
        this.learningProficiency = this.learningLanguages[0].proficiency || "A1";
    } else if (this.learningLanguage) {
        this.learningLanguages = [{ language: this.learningLanguage, proficiency: this.learningProficiency || "A1" }];
    }

    if (!this.isModified("password")) return next();
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

//compare the entered password with the hashed password
//if they match then return true else return false
userSchema.methods.matchPassword = async function (enteredPassword) {
    const isPasswordCorrect = await bcrypt.compare(enteredPassword, this.password);
    return isPasswordCorrect;
};

const User = mongoose.model("User", userSchema);



export default User; //export the model