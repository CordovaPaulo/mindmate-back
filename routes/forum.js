const express = require('express');
const router = express.Router();
const forumController = require('../controllers/forum');
const { authenticateToken } = require('../service/jwt');

// post functions
router.post('/posts', authenticateToken(), forumController.createPost);
router.post('/posts/comment/:id', authenticateToken(), forumController.addCommentToPost);
router.post('/posts/upvote/:id', authenticateToken(), forumController.upvotePost);
router.post('/posts/downvote/:id', authenticateToken(), forumController.downvotePost);
router.post('/comments/:id', authenticateToken(), forumController.addCommentToComment);
router.post('/comments/upvote/:id', authenticateToken(), forumController.upvoteComment);
router.post('/comments/downvote/:id', authenticateToken(), forumController.downvoteComment);

// get functions
router.get('/posts', authenticateToken(), forumController.getPosts);
router.get('/posts/:id', authenticateToken(), forumController.getPostById);
router.get('/posts/comments/:id', authenticateToken(), forumController.getCommentsByPostId);
router.get('/comments/replies/:id', authenticateToken(), forumController.getReplyToCommentsByCommentId);

// delete functions
router.delete('/posts/:id', authenticateToken(), forumController.deletePost);
router.delete('/comments/:id', authenticateToken(), forumController.deleteComment);

module.exports = router;