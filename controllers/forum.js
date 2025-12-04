const User = require('../models/user');
const Forum = require('../models/Forum');
const ForumComment = require('../models/ForumComment');
const ForumMetrics = require('../models/ForumMetrics');
const { getValuesFromToken } =  require('../service/jwt');


exports.createPost = async (req, res) => {
    try {
        const { title, content, topics } = req.body;
        const decoded = getValuesFromToken(req);

        if(!title || !content) {
            return res.status(400).json({ error: "Title and content are required" });
        }

        const newPost = new Forum({
            title,
            content,
            author: decoded.id,
            authorName: decoded.username,
            topics
        });

        const postMetric = new ForumMetrics({
            target: newPost._id,
            onModel: 'Forum',
        });

        await newPost.save();
        await postMetric.save();
        res.status(201).json(newPost);
    } catch (error) {
        console.error("Error creating post:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

exports.getPosts = async (req, res) => {
    try {
        const posts = await Forum.find({archived: false}).sort({ createdAt: -1 });
        const metrics = await ForumMetrics.find({ target: { $in: posts.map(p => p._id) }, onModel: 'Forum' });
        res.status(200).json(posts.map(post => ({
            id: post._id,
            title: post.title,
            content: post.content,
            author: post.author,
            authorName: post.authorName,
            createdAt: post.createdAt,
            upvotes: metrics.find(m => m.target.toString() === post._id.toString())?.upvote || 0,
            downvotes: metrics.find(m => m.target.toString() === post._id.toString())?.downvote || 0,
            commentsCount: metrics.find(m => m.target.toString() === post._id.toString())?.commentsCount || 0,
        })));  
    } catch (error) {
        console.error("Error fetching posts:", error);
        res.status(500).json({ error: "Internal server error" });
    }

}

exports.getPostById = async (req, res) => {
    const { id } = req.params;
    try {
        const post = await Forum.findOne({ _id: id, archived: false });
        const metric = await ForumMetrics.findOne({ target: id, onModel: 'Forum' });
        if (!post) {
            return res.status(404).json({ error: "Post not found" });
        }
        res.status(200).json({
            id: post._id,
            title: post.title,
            content: post.content,
            author: post.author,
            authorName: post.authorName,
            createdAt: post.createdAt,
            upvotes: metric?.upvote || 0,
            downvotes: metric?.downvote || 0,
            commentsCount: metric?.commentsCount || 0,
        });
    } catch (error) {
        console.error("Error fetching post by ID:", error);
        res.status(500).json({ error: "Internal server error" });
    }

}

exports.addCommentToPost = async (req, res) => {
    const { id } = req.params;
    const { content } = req.body;
    const decoded = getValuesFromToken(req);

    if (!content) {
        return res.status(400).json({ error: "Content is required" });
    }

    try {
        const post = await Forum.findById(id);
        if (!post) {
            return res.status(404).json({ error: "Post not found" });
        }

        const newComment = new ForumComment({
            target: id,
            onModel: 'Forum',
            content,
            author: decoded.id,
            authorName: decoded.username
        });

        // increment (or create) metrics for the parent post
        await ForumMetrics.findOneAndUpdate(
            { target: id, onModel: 'Forum' },
            { $inc: { commentsCount: 1 } },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        // create metrics for the newly created comment so it can be upvoted/downvoted/replied-to
        const commentMetrics = new ForumMetrics({
            target: newComment._id,
            onModel: 'ForumComment',
        });
        await commentMetrics.save();

        await newComment.save();
        res.status(201).json(newComment);
    } catch (error) {
        console.error("Error adding comment to post:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

exports.addCommentToComment = async (req, res) => {
    const { id } = req.params;
    const { content } = req.body;
    const decoded = getValuesFromToken(req);

    if (!content) {
        return res.status(400).json({ error: "Content is required" });
    }

    try {
        const parentComment = await ForumComment.findById(id);
        if (!parentComment) {
            return res.status(404).json({ error: "Comment not found" });
        }

        const newComment = new ForumComment({
            target: id,
            onModel: 'ForumComment',
            content,
            author: decoded.id,
            authorName: decoded.username
        });

        // increment (or create) metrics for the parent comment
        await ForumMetrics.findOneAndUpdate(
            { target: id, onModel: 'ForumComment' },
            { $inc: { commentsCount: 1 } },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        // create metrics for the newly created reply comment
        const replyMetrics = new ForumMetrics({
            target: newComment._id,
            onModel: 'ForumComment',
        });
        await replyMetrics.save();

        await newComment.save();
        res.status(201).json(newComment);
    } catch (error) {
        console.error("Error adding comment to comment:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

exports.upvotePost = async (req, res) => {
    const { id } = req.params;
    try {
        const post = await Forum.findById(id);
        if (!post) {
            return res.status(404).json({ error: "Post not found" });
        }

        const metrics = await ForumMetrics.findOneAndUpdate(
            { target: id, onModel: 'Forum' },
            { $inc: { upvote: 1 } },
            { new: true, upsert: true }
        );

        await metrics.save();
        res.status(200).json({ message: "Post upvoted successfully" });
    } catch (error) {
        console.error("Error upvoting post:", error);
        res.status(500).json({ error: "Internal server error" });
    }

}

exports.downvotePost = async (req, res) => {
    const { id } = req.params;
    try {
        const post = await Forum.findById(id);
        if (!post) {
            return res.status(404).json({ error: "Post not found" });
        }

        const metrics = await ForumMetrics.findOneAndUpdate(
            { target: id, onModel: 'Forum' },
            { $inc: { downvote: 1 } },
            { new: true, upsert: true }
        );
        res.status(200).json({ message: "Post downvoted successfully" });
    } catch (error) {
        console.error("Error downvoting post:", error);
        res.status(500).json({ error: "Internal server error" });
    }

}

exports.upvoteComment = async (req, res) => {
    const { id } = req.params;
    try {
        const comment = await ForumComment.findById(id);
        if (!comment) {
            return res.status(404).json({ error: "Comment not found" });
        }

        const metrics = await ForumMetrics.findOneAndUpdate(
            { target: id, onModel: 'ForumComment' },
            { $inc: { upvote: 1 } },
            { new: true, upsert: true }
        );
        res.status(200).json({ message: "Comment upvoted successfully" });
    } catch (error) {
        console.error("Error upvoting comment:", error);
        res.status(500).json({ error: "Internal server error" });
    }

}

exports.downvoteComment = async (req, res) => {
    const { id } = req.params;
    try {
        const comment = await ForumComment.findById(id);
        if (!comment) {
            return res.status(404).json({ error: "Comment not found" });
        }

        const metrics = await ForumMetrics.findOneAndUpdate(
            { target: id, onModel: 'ForumComment' },
            { $inc: { downvote: 1 } },
            { new: true, upsert: true }
        );
        res.status(200).json({ message: "Comment downvoted successfully" });
    } catch (error) {
        console.error("Error downvoting comment:", error);
        res.status(500).json({ error: "Internal server error" });
    }

}

exports.getCommentsByPostId = async (req, res) => {
    const { id } = req.params;
    try {
        const post = await Forum.findOne({ _id: id, archived: false });
        if (!post) {
            return res.status(404).json({ error: "Post not found" });
        }

        const comments = await ForumComment.find({ target: id, onModel: 'Forum', archived: false });
        // fetch metrics for all comments (use $in on comment ids)
        const commentMetrics = await ForumMetrics.find({
            target: { $in: comments.map(c => c._id) },
            onModel: 'ForumComment'
        });

        res.status(200).json(comments.map(comment => {
            const m = commentMetrics.find(cm => cm.target.toString() === comment._id.toString());
            return {
                id: comment._id,
                content: comment.content,
                author: comment.author,
                authorName: comment.authorName,
                createdAt: comment.createdAt,
                upvotes: m?.upvote || 0,
                downvotes: m?.downvote || 0,
                commentsCount: m?.commentsCount || 0,
            };
        }));
    } catch (error) {
        console.error("Error fetching comments by post ID:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

exports.getReplyToCommentsByCommentId = async (req, res) => {
    const { id } = req.params;
    try {
        const comment = await ForumComment.findById(id);
        if (!comment) {
            return res.status(404).json({ error: "Comment not found" });
        }

        const replies = await ForumComment.find({ target: id, onModel: 'ForumComment' });
        const replyMetrics = await ForumMetrics.find({
            target: { $in: replies.map(r => r._id) },
            onModel: 'ForumComment'
        });

        res.status(200).json(replies.map(reply => {
            const m = replyMetrics.find(rm => rm.target.toString() === reply._id.toString());
            return {
                id: reply._id,
                content: reply.content,
                author: reply.author,
                authorName: reply.authorName,
                createdAt: reply.createdAt,
                upvotes: m?.upvote || 0,
                downvotes: m?.downvote || 0,
                commentsCount: m?.commentsCount || 0,
            };
        }));
    } catch (error) {
        console.error("Error fetching replies to comment by comment ID:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

exports.deletePost = async (req, res) => {
    const { id } = req.params;
    try {
        const post = await Forum.findById(id);
        if (!post) {
            return res.status(404).json({ error: "Post not found" });
        }
        await post.deleteOne();
        res.status(200).json({ message: "Post deleted successfully" });
    } catch (error) {
        console.error("Error deleting post:", error);
        res.status(500).json({ error: "Internal server error" });
    }

}

exports.deleteComment = async (req, res) => {
    const { id } = req.params;
    try {
        const comment = await ForumComment.findById(id);
        if (!comment) {
            return res.status(404).json({ error: "Comment not found" });
        }
        await comment.deleteOne();
        res.status(200).json({ message: "Comment deleted successfully" });
    } catch (error) {
        console.error("Error deleting comment:", error);
        res.status(500).json({ error: "Internal server error" });
    }

}

exports.adminArchivePost = async (req, res) => {
    const decoded = getValuesFromToken(req);
    if (!decoded) {
        return res.status(403).json({ error: "Access denied" });
    }

    const { id } = req.params;
    
    try {
        const post = await Forum.findOne({ _id: id, archived: false });
        if (!post) {
            return res.status(404).json({ error: "Post not found" });
        }
        post.archived = true;
        await post.save();
        res.status(200).json({ message: "Post archived successfully" });
    } catch (error) {
        console.error("Error archiving post:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

exports.adminArchiveComment = async (req, res) => {
    const decoded = getValuesFromToken(req);
    if (!decoded) {
        return res.status(403).json({ error: "Access denied" });
    }

    const { id } = req.params;

    try {
        const comment = await ForumComment.findOne({ _id: id, archived: false });
        if (!comment) {
            return res.status(404).json({ error: "Comment not found" });
        }
        comment.archived = true;
        await comment.save();
        res.status(200).json({ message: "Comment archived successfully" });
    } catch (error) {
        console.error("Error archiving comment:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

exports.adminRestorePost = async (req, res) => {
    const decoded = getValuesFromToken(req);
    if (!decoded) {
        return res.status(403).json({ error: "Access denied" });
    }

    const { id } = req.params;
    
    try {
        const post = await Forum.findOne({ _id: id, archived: true });
        if (!post) {
            return res.status(404).json({ error: "Archived post not found" });
        }
        post.archived = false;
        await post.save();
        res.status(200).json({ message: "Post restored successfully" });
    } catch (error) {
        console.error("Error restoring post:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

exports.adminRestoreComment = async (req, res) => {
    const decoded = getValuesFromToken(req);
    if (!decoded) {
        return res.status(403).json({ error: "Access denied" });
    }

    const { id } = req.params;

    try {
        const comment = await ForumComment.findOne({ _id: id, archived: true });
        if (!comment) {
            return res.status(404).json({ error: "Archived comment not found" });
        }
        comment.archived = false;
        await comment.save();
        res.status(200).json({ message: "Comment restored successfully" });
    } catch (error) {
        console.error("Error restoring comment:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

exports.adminGetAllPosts = async (req, res) => {
    try {
        const posts = await Forum.find().sort({ createdAt: -1 });
        const metrics = await ForumMetrics.find({ target: { $in: posts.map(p => p._id) }, onModel: 'Forum' });
        res.status(200).json(posts.map(post => ({
            id: post._id,
            title: post.title,
            content: post.content,
            author: post.author,
            archived: post.archived,
            authorName: post.authorName,
            createdAt: post.createdAt,
            upvotes: metrics.find(m => m.target.toString() === post._id.toString())?.upvote || 0,
            downvotes: metrics.find(m => m.target.toString() === post._id.toString())?.downvote || 0,
            commentsCount: metrics.find(m => m.target.toString() === post._id.toString())?.commentsCount || 0,
        })));  
    } catch (error) {
        console.error("Error fetching posts:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

exports.adminGetAllComments = async (req, res) => {
    const { id } = req.params;
    try {
        const post = await Forum.findOne({ _id: id });
        if (!post) {
            return res.status(404).json({ error: "Post not found" });
        }

        const comments = await ForumComment.find({ target: id, onModel: 'Forum' });
        // fetch metrics for all comments (use $in on comment ids)
        const commentMetrics = await ForumMetrics.find({
            target: { $in: comments.map(c => c._id) },
            onModel: 'ForumComment'
        });

        res.status(200).json(comments.map(comment => {
            const m = commentMetrics.find(cm => cm.target.toString() === comment._id.toString());
            return {
                id: comment._id,
                content: comment.content,
                author: comment.author,
                archived: comment.archived,
                authorName: comment.authorName,
                createdAt: comment.createdAt,
                upvotes: m?.upvote || 0,
                downvotes: m?.downvote || 0,
                commentsCount: m?.commentsCount || 0,
            };
        }));
    } catch (error) {
        console.error("Error fetching comments by post ID:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
