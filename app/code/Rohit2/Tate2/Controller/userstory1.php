<?php
namespace Rohit2\Tate2\Controller;

use Magento\Framework\App\Action\Action;
use Magento\Framework\App\Action\Context;
use Rohit2\Tate2\Kumar\Test2;

class userstory1 extends Action{
    protected $Test2;
    
    public function __construct(Context $context, Test2 $Test2)
    {
        $this->Test2 = $Test2;
        parent::__construct($context);
    }
    public function execute(){
        $this->Test2->displayParams();
    }

}

?>