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

// admin functions
router.patch('/admin/comment/archive/:id', authenticateToken('admin'), forumController.adminArchiveComment);
router.patch('/admin/post/archive/:id', authenticateToken('admin'), forumController.adminArchivePost);
router.patch('/admin/post/restore/:id', authenticateToken('admin'), forumController.adminRestorePost);
router.patch('/admin/comment/restore/:id', authenticateToken('admin'), forumController.adminRestoreComment);

router.delete('/admin/post/delete/:id', authenticateToken('admin'), forumController.deletePost);
router.delete('/admin/comment/delete/:id', authenticateToken('admin'), forumController.deleteComment);

router.get('/admin/posts', authenticateToken('admin'), forumController.adminGetAllPosts);
router.get('/admin/posts/comments/:id', authenticateToken('admin'), forumController.adminGetAllComments);
module.exports = router;