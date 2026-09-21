import mongoose from "mongoose";

// Bookmark interface
export interface IBookmark {
    post: mongoose.Types.ObjectId;
    user: mongoose.Types.ObjectId;
}

// Bookmark schema
const bookmarkSchema = new mongoose.Schema<IBookmark>({
    post: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Post",
        required: true,
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
});

export const BookmarkModel = mongoose.model<IBookmark>("Bookmark", bookmarkSchema);