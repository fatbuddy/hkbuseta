const gulp = require('gulp');
const inlineSource = require('gulp-inline-source');

gulp.task('inline', () => {
    return gulp.src('./index.html')
        .pipe(inlineSource())
        .pipe(gulp.dest('./dist'));
});
