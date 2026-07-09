<?php
require __DIR__ . '/bootstrap.php';

if (current_user()) {
    redirect('admin.php');
}

redirect('login.php');
