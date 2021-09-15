function updateStars(run) {
    var ratingimage = document.getElementById('ratingimage');
    switch(run.value) {
        case '0.5':
            ratingimage.src = "../stars/05.png";
            break;
        case '1':
            ratingimage.src = "../stars/1.png";
            break;
        case '1.5':
            ratingimage.src = "../stars/15.png";
            break;
        case '2':
            ratingimage.src = "../stars/2.png";
            break;
        case '2.5':
            ratingimage.src = "../stars/25.png";
            break;
        case '3':
            ratingimage.src = "../stars/3.png";
            break;
        case '3.5':
            ratingimage.src = "../stars/35.png";
            break;
        case '4':
            ratingimage.src = "../stars/4.png";
            break;
        case '4.5':
            ratingimage.src = "../stars/45.png";
            break;
        case '5':
            ratingimage.src = "../stars/5.png";
            break;
    }
}