<?php
namespace Rohit2\Tate2\Model\ResourceModel;

use Magento\Framework\Model\ResourceModel\Db\AbstractDb;

class Employee extends AbstractDb
{
    protected function _construct()
    {
        $this->_init('employee_table2', 'employee_id2');
    }
}